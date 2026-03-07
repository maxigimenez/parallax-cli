import { TASK_STATUS, type TaskStatus } from './task-constants'
import type { TaskInfo } from '@/hooks/useParallax'

const MAX_LOG_ENTRIES = 500

type TaskLogEntry = TaskInfo['logs'][number]

type IncomingApiTask = Omit<TaskInfo, 'status'> & {
  status: string
  logs?: TaskInfo['logs']
}

type LogEvent = {
  taskId: string
  msg: string
  icon: string
  level: TaskLogEntry['level']
  timestamp: number
}

type StatusEvent = {
  taskId: string
  status: string
}

function canonicalizeLogMessage(message: string, icon: string): string {
  const withoutTaskPrefix = message.replace(/^\[[^\]]+\]\s*/, '').trim()
  const escapedIcon = icon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return withoutTaskPrefix.replace(new RegExp(`^${escapedIcon}\\s+`), '').trim()
}

function getLogSignature(log: TaskLogEntry) {
  const normalizedMessage = canonicalizeLogMessage(log.message, log.icon)
  return `${log.timestamp}|${log.icon}|${normalizedMessage}|${log.level}`
}

function mergeTaskLogs(existing: TaskLogEntry[], incoming: TaskLogEntry[]) {
  const signatureToLog = new Map<string, TaskLogEntry>()

  for (const log of existing) {
    signatureToLog.set(getLogSignature(log), log)
  }

  for (const log of incoming) {
    signatureToLog.set(getLogSignature(log), log)
  }

  const merged = Array.from(signatureToLog.values())
  merged.sort((a, b) => a.timestamp - b.timestamp)
  return merged.slice(-MAX_LOG_ENTRIES)
}

export function normalizeTaskStatus(status: string): TaskStatus {
  if (status === 'IN_PROGRESS' || status === 'running') {
    return TASK_STATUS.RUNNING
  }
  if (status === 'COMPLETED' || status === 'done') {
    return TASK_STATUS.DONE
  }
  if (status === 'FAILED' || status === 'failed') {
    return TASK_STATUS.FAILED
  }
  if (status === 'CANCELED' || status === 'canceled') {
    return TASK_STATUS.CANCELED
  }
  return TASK_STATUS.QUEUED
}

function ensureTask(tasks: Record<string, TaskInfo>, taskId: string, overrides: Partial<TaskInfo> = {}) {
  return (
    tasks[taskId] || {
      id: taskId,
      msg: '',
      startTime: Date.now(),
      status: TASK_STATUS.QUEUED,
      logs: [],
      ...overrides,
    }
  )
}

export function replaceTasksFromApi(
  previous: Record<string, TaskInfo>,
  incoming: IncomingApiTask[]
): Record<string, TaskInfo> {
  const next: Record<string, TaskInfo> = {}

  for (const task of incoming) {
    const previousTask = previous[task.id]
    next[task.id] = {
      ...task,
      status: normalizeTaskStatus(task.status),
      logs: mergeTaskLogs(previousTask?.logs || [], task.logs || []),
    }
  }

  return next
}

export function upsertTaskState(
  previous: Record<string, TaskInfo>,
  taskId: string,
  patch: Partial<TaskInfo>
): Record<string, TaskInfo> {
  const current = ensureTask(previous, taskId, patch)
  return {
    ...previous,
    [taskId]: {
      ...current,
      ...patch,
    },
  }
}

export function applyTaskLogEvent(
  previous: Record<string, TaskInfo>,
  event: LogEvent
): Record<string, TaskInfo> {
  const task = ensureTask(previous, event.taskId, {
    msg: event.msg,
    status: TASK_STATUS.RUNNING,
  })
  const incoming: TaskLogEntry = {
    message: event.msg,
    icon: event.icon,
    level: event.level,
    timestamp: event.timestamp,
  }
  const latest = task.logs[task.logs.length - 1]
  if (latest && getLogSignature(latest) === getLogSignature(incoming)) {
    return previous
  }

  return {
    ...previous,
    [event.taskId]: {
      ...task,
      msg: event.msg,
      logs: mergeTaskLogs(task.logs, [incoming]),
    },
  }
}

export function applyTaskStatusEvent(
  previous: Record<string, TaskInfo>,
  event: StatusEvent
): Record<string, TaskInfo> {
  const task = ensureTask(previous, event.taskId, {
    msg: event.status,
  })

  return {
    ...previous,
    [event.taskId]: {
      ...task,
      status: normalizeTaskStatus(event.status),
    },
  }
}

export function removeTaskState(previous: Record<string, TaskInfo>, taskId: string) {
  if (!previous[taskId]) {
    return previous
  }

  const next = { ...previous }
  delete next[taskId]
  return next
}
