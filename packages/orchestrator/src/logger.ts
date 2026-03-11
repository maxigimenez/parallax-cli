import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import {
  LOG_LEVEL,
  Logger,
  LogLevel,
  TASK_LOG_KIND,
  TASK_LOG_LEVEL,
  TASK_LOG_SOURCE,
  TASK_RUNTIME_STATUS,
  type TaskLogEntry,
  type TaskLogKind,
  type TaskLogLevel,
  type TaskLogSource,
  type TaskRuntimeStatus,
} from '@parallax/common'
import { dbService } from './database.js'
import {
  appendTaskLog,
  clearTaskState as clearTaskStateStore,
  getTaskLogs,
  getTaskStatuses,
  touchTaskStatus,
  updateTaskStatus,
} from './logging/task-log-store.js'
import {
  emitTaskLog,
  emitTaskRemoved,
  emitTaskStatus,
  setIo,
} from './logging/socket-publisher.js'

let currentLogLevels: LogLevel[] = ['info', 'success', 'warn', 'error']

const LOG_ICON = {
  info: chalk.blue('ℹ'),
  success: chalk.green('✔'),
  warning: chalk.yellow('⚠'),
  error: chalk.red('✖'),
} as const

export { getTaskLogs, getTaskStatuses, setIo }

export function setLogLevels(levels: LogLevel[]) {
  currentLogLevels = levels
}

export function setTaskQueued(taskId: string, message: string) {
  setTaskRuntimeStatus(taskId, message, TASK_RUNTIME_STATUS.QUEUED)
}

export function setTaskRunning(taskId: string, message: string) {
  setTaskRuntimeStatus(taskId, message, TASK_RUNTIME_STATUS.RUNNING)
}

export function setTaskDone(taskId: string, message: string) {
  setTaskRuntimeStatus(taskId, message, TASK_RUNTIME_STATUS.DONE)
}

export function setTaskFailed(taskId: string, message: string) {
  setTaskRuntimeStatus(taskId, message, TASK_RUNTIME_STATUS.FAILED)
}

export function setTaskCanceled(taskId: string, message: string) {
  setTaskRuntimeStatus(taskId, message, TASK_RUNTIME_STATUS.CANCELED)
}

export function clearTaskState(taskId: string) {
  clearTaskStateStore(taskId)
  emitTaskRemoved(taskId)
}

export function resetTaskRuntimeState(taskId: string) {
  clearTaskStateStore(taskId)
}

function setTaskRuntimeStatus(taskId: string, message: string, status: TaskRuntimeStatus) {
  updateTaskStatus(taskId, message, status)
  emitTaskStatus(taskId, status)
}

function normalizeMessage(message: string) {
  return stripAnsi(message).trim().replace(/[\uFFFD]/g, '')
}

function formatConsoleLine(taskId: string | undefined, icon: string, message: string) {
  const taskPrefix = taskId ? `${chalk.magenta(`[${taskId}]`)} ` : ''
  return `${taskPrefix}${icon} ${message}`
}

function buildLogMessage(taskId: string, message: string) {
  return `[${taskId}] ${message}`
}

function writeTaskLog(entry: Omit<TaskLogEntry, 'timestamp'> & { taskId: string }) {
  const timestamp = Date.now()
  const persistedEntry: TaskLogEntry = {
    title: entry.title,
    message: buildLogMessage(entry.taskId, entry.message),
    icon: stripAnsi(entry.icon),
    level: entry.level,
    timestamp,
    kind: entry.kind,
    source: entry.source,
    groupId: entry.groupId,
  }

  appendTaskLog(entry.taskId, persistedEntry)
  dbService.appendTaskLog({
    taskExternalId: entry.taskId,
    ...persistedEntry,
  })
  emitTaskLog(entry.taskId, persistedEntry)
}

function writeConsoleAndTaskLog(
  taskId: string | undefined,
  title: string | undefined,
  level: TaskLogLevel,
  icon: string,
  message: string,
  kind: TaskLogKind,
  source: TaskLogSource,
  groupId?: string
) {
  const rawMessage = normalizeMessage(message)
  if (!rawMessage) {
    return
  }

  console.log(formatConsoleLine(taskId, icon, rawMessage.split('\n')[0] || rawMessage))

  if (!taskId) {
    return
  }

  writeTaskLog({
    taskId,
    title,
    level,
    icon,
    message: rawMessage,
    kind,
    source,
    groupId,
  })
}

function shouldEmitLog(configuredLevel: LogLevel) {
  return currentLogLevels.includes(configuredLevel)
}

function emitLoggerMessage(
  taskId: string | undefined,
  configuredLevel: LogLevel,
  persistedLevel: TaskLogLevel,
  icon: string,
  message: string,
  kind: TaskLogKind,
  source: TaskLogSource
) {
  if (taskId) {
    touchTaskStatus(taskId, message)
  }

  if (!shouldEmitLog(configuredLevel)) {
    return
  }

  const lines = normalizeMessage(message).split('\n').map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    writeConsoleAndTaskLog(taskId, undefined, persistedLevel, icon, line, kind, source)
  }
}

export const logger: Logger = {
  info(message, taskId) {
    emitLoggerMessage(
      taskId,
      LOG_LEVEL.INFO,
      TASK_LOG_LEVEL.INFO,
      LOG_ICON.info,
      message,
      TASK_LOG_KIND.LIFECYCLE,
      TASK_LOG_SOURCE.SYSTEM
    )
  },
  success(message, taskId) {
    emitLoggerMessage(
      taskId,
      LOG_LEVEL.SUCCESS,
      TASK_LOG_LEVEL.INFO,
      LOG_ICON.success,
      message,
      TASK_LOG_KIND.RESULT,
      TASK_LOG_SOURCE.SYSTEM
    )
  },
  warn(message, taskId) {
    emitLoggerMessage(
      taskId,
      LOG_LEVEL.WARN,
      TASK_LOG_LEVEL.WARNING,
      LOG_ICON.warning,
      message,
      TASK_LOG_KIND.WARNING,
      TASK_LOG_SOURCE.SYSTEM
    )
  },
  error(message, taskId) {
    emitLoggerMessage(
      taskId,
      LOG_LEVEL.ERROR,
      TASK_LOG_LEVEL.ERROR,
      LOG_ICON.error,
      message,
      TASK_LOG_KIND.ERROR,
      TASK_LOG_SOURCE.SYSTEM
    )
  },
  event({ taskId, title, message, level = TASK_LOG_LEVEL.INFO, kind, source, icon, groupId }) {
    const resolvedIcon =
      icon ??
      (level === TASK_LOG_LEVEL.ERROR
        ? LOG_ICON.error
        : level === TASK_LOG_LEVEL.WARNING
          ? LOG_ICON.warning
          : LOG_ICON.info)

    if (taskId) {
      touchTaskStatus(taskId, message)
    }

    writeConsoleAndTaskLog(taskId, title, level, resolvedIcon, message, kind, source, groupId)
  },
}
