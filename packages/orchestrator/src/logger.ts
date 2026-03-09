import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import { LOG_LEVEL, Logger, LogLevel, TASK_RUNTIME_STATUS, type TaskRuntimeStatus } from '@parallax/common'
import { dbService } from './database.js'
import {
  appendTaskLog,
  clearTaskState as clearTaskStateStore,
  getTaskLogs,
  getTaskStatuses,
  touchTaskStatus,
  type TaskLogLevel,
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

function writeTaskLog(taskId: string, level: TaskLogLevel, icon: string, message: string) {
  const timestamp = Date.now()
  const logMessage = buildLogMessage(taskId, message)
  const entry = {
    message: logMessage,
    icon: stripAnsi(icon),
    level,
    timestamp,
  }

  appendTaskLog(taskId, entry)
  dbService.appendTaskLog({
    taskExternalId: taskId,
    ...entry,
  })
  emitTaskLog(taskId, entry)
}

function logMessage(taskId: string | undefined, level: TaskLogLevel, icon: string, message: string) {
  const raw = normalizeMessage(message)
  if (!raw) {
    return
  }

  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    console.log(formatConsoleLine(taskId, icon, line))

    if (!taskId) {
      continue
    }

    writeTaskLog(taskId, level, icon, line)
  }
}

function shouldEmitLog(configuredLevel: LogLevel) {
  return currentLogLevels.includes(configuredLevel)
}

function emitLoggerMessage(
  taskId: string | undefined,
  configuredLevel: LogLevel,
  persistedLevel: TaskLogLevel,
  icon: string,
  message: string
) {
  if (taskId) {
    touchTaskStatus(taskId, message)
  }

  if (!shouldEmitLog(configuredLevel)) {
    return
  }

  logMessage(taskId, persistedLevel, icon, message)
}

export const logger: Logger = {
  info(message, taskId) {
    emitLoggerMessage(taskId, LOG_LEVEL.INFO, 'info', LOG_ICON.info, message)
  },
  success(message, taskId) {
    emitLoggerMessage(taskId, LOG_LEVEL.SUCCESS, 'info', LOG_ICON.success, message)
  },
  warn(message, taskId) {
    emitLoggerMessage(taskId, LOG_LEVEL.WARN, 'warning', LOG_ICON.warning, message)
  },
  error(message, taskId) {
    emitLoggerMessage(taskId, LOG_LEVEL.ERROR, 'error', LOG_ICON.error, message)
  },
}
