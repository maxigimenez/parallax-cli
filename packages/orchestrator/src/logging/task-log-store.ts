import stripAnsi from 'strip-ansi'
import { TASK_RUNTIME_STATUS, type TaskLogEntry, type TaskRuntimeStatus } from '@parallax/common'

export type TaskStatusSnapshot = {
  msg: string
  startTime: number
  status: TaskRuntimeStatus
}

const taskStatuses = new Map<string, TaskStatusSnapshot>()
const taskLogs = new Map<string, TaskLogEntry[]>()

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function canonicalizeMessage(entry: TaskLogEntry) {
  const withoutTaskPrefix = entry.message.replace(/^\[[^\]]+\]\s*/, '').trim()
  const withoutIcon = withoutTaskPrefix.replace(new RegExp(`^${escapeForRegex(entry.icon)}\\s+`), '').trim()
  return withoutIcon
}

function getLogSignature(entry: TaskLogEntry) {
  return `${entry.timestamp}|${entry.level}|${entry.kind}|${entry.source}|${entry.groupId ?? ''}|${canonicalizeMessage(entry)}`
}

export function getTaskStatuses() {
  return taskStatuses
}

export function getTaskLogs() {
  return taskLogs
}

export function clearTaskState(taskId: string) {
  taskStatuses.delete(taskId)
  taskLogs.delete(taskId)
}

export function updateTaskStatus(taskId: string, message: string, status: TaskRuntimeStatus) {
  const current = taskStatuses.get(taskId)
  taskStatuses.set(taskId, {
    msg: stripAnsi(message),
    startTime: current?.startTime ?? Date.now(),
    status,
  })
}

export function touchTaskStatus(taskId: string, message: string) {
  const current = taskStatuses.get(taskId)
  if (!current) {
    updateTaskStatus(taskId, message, TASK_RUNTIME_STATUS.RUNNING)
    return
  }

  taskStatuses.set(taskId, {
    ...current,
    msg: stripAnsi(message),
  })
}

export function appendTaskLog(taskId: string, entry: TaskLogEntry) {
  const current = taskLogs.get(taskId) ?? []
  const signature = getLogSignature(entry)
  if (current.some((candidate) => getLogSignature(candidate) === signature)) {
    return
  }
  current.push(entry)
  taskLogs.set(taskId, current)
}
