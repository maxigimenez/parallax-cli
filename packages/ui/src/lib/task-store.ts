import { TASK_LOG_KIND, TASK_LOG_SOURCE } from '@parallax/common'
import { TASK_STATUS, type TaskStatus } from './task-constants'
import type { TaskInfo } from '@/hooks/useParallax'
import { canonicalizeTaskLogMessage } from './log-normalization'

type TaskLogEntry = TaskInfo['logs'][number]

type IncomingApiTask = Omit<TaskInfo, 'status'> & {
  status: string
  logs?: TaskInfo['logs']
}

type LogEvent = {
  taskId: string
  title?: string
  msg: string
  icon: string
  level: TaskLogEntry['level']
  timestamp: number
  kind?: TaskLogEntry['kind']
  source?: TaskLogEntry['source']
  groupId?: string
}

type StatusEvent = {
  taskId: string
  status: string
}

export function hasTaskState(tasks: Record<string, TaskInfo>, taskId: string): boolean {
  return taskId in tasks
}

function getLogSignature(log: TaskLogEntry) {
  const normalizedMessage = canonicalizeTaskLogMessage(log)
  return `${log.timestamp}|${log.icon}|${normalizedMessage}|${log.level}|${log.kind}|${log.source}|${log.groupId ?? ''}`
}

function choosePreferredLogEntry(existing: TaskLogEntry | undefined, incoming: TaskLogEntry) {
  if (!existing) {
    return incoming
  }

  const existingScore =
    (existing.title ? 1 : 0) +
    (existing.groupId ? 1 : 0)
  const incomingScore =
    (incoming.title ? 1 : 0) +
    (incoming.groupId ? 1 : 0)

  return incomingScore >= existingScore ? incoming : existing
}

function normalizeLogEntry(log: TaskLogEntry): TaskLogEntry {
  return {
    ...log,
    kind: log.kind ?? TASK_LOG_KIND.LIFECYCLE,
    source: log.source ?? TASK_LOG_SOURCE.SYSTEM,
    groupId: log.groupId ?? undefined,
  }
}

function mergeTaskLogs(existing: TaskLogEntry[], incoming: TaskLogEntry[]) {
  const signatureToLog = new Map<string, TaskLogEntry>()

  for (const log of existing) {
    const normalized = normalizeLogEntry(log)
    const signature = getLogSignature(normalized)
    signatureToLog.set(signature, choosePreferredLogEntry(signatureToLog.get(signature), normalized))
  }

  for (const log of incoming) {
    const normalized = normalizeLogEntry(log)
    const signature = getLogSignature(normalized)
    signatureToLog.set(signature, choosePreferredLogEntry(signatureToLog.get(signature), normalized))
  }

  const merged = Array.from(signatureToLog.values())
  merged.sort((a, b) => a.timestamp - b.timestamp)
  return merged
}

export function normalizeTaskStatus(status: string): TaskStatus {
  if (status === 'IN_PROGRESS' || status === TASK_STATUS.RUNNING) {
    return TASK_STATUS.RUNNING
  }
  if (status === 'COMPLETED' || status === TASK_STATUS.DONE) {
    return TASK_STATUS.DONE
  }
  if (status === 'FAILED' || status === TASK_STATUS.FAILED) {
    return TASK_STATUS.FAILED
  }
  if (status === 'CANCELED' || status === TASK_STATUS.CANCELED) {
    return TASK_STATUS.CANCELED
  }

  if (status === 'PENDING' || status === TASK_STATUS.QUEUED) {
    return TASK_STATUS.QUEUED
  }

  throw new Error(`Unsupported task status "${status}".`)
}

function requireTask(tasks: Record<string, TaskInfo>, taskId: string): TaskInfo {
  const task = tasks[taskId]
  if (!task) {
    throw new Error(`Task "${taskId}" is not available in the UI store.`)
  }

  return task
}

export function replaceTasksFromApi(
  previous: Record<string, TaskInfo>,
  incoming: IncomingApiTask[]
): Record<string, TaskInfo> {
  const next: Record<string, TaskInfo> = {}

  for (const task of incoming) {
    next[task.id] = {
      ...task,
      status: normalizeTaskStatus(task.status),
      logs: mergeTaskLogs([], task.logs ?? []),
    }
  }

  return next
}

export function upsertTaskState(
  previous: Record<string, TaskInfo>,
  taskId: string,
  patch: Partial<TaskInfo>
): Record<string, TaskInfo> {
  const current = requireTask(previous, taskId)
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
  const task = previous[event.taskId]
  if (!task) {
    return previous
  }
  const incoming: TaskLogEntry = {
    title: event.title,
    message: event.msg,
    icon: event.icon,
    level: event.level,
    timestamp: event.timestamp,
    kind: event.kind ?? TASK_LOG_KIND.LIFECYCLE,
    source: event.source ?? TASK_LOG_SOURCE.SYSTEM,
    groupId: event.groupId,
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
  const task = previous[event.taskId]
  if (!task) {
    return previous
  }

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
