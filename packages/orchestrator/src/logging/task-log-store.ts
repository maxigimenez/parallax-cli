import stripAnsi from 'strip-ansi'
import { TASK_RUNTIME_STATUS, type TaskRuntimeStatus } from '@parallax/common'

export type TaskLogLevel = 'info' | 'warning' | 'error'

export type TaskLogEntry = {
  message: string
  icon: string
  level: TaskLogLevel
  timestamp: number
}

export type TaskStatusSnapshot = {
  msg: string
  startTime: number
  status: TaskRuntimeStatus
}

const MAX_LOG_ENTRIES = 1000

const taskStatuses = new Map<string, TaskStatusSnapshot>()
const taskLogs = new Map<string, TaskLogEntry[]>()

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
  current.push(entry)
  if (current.length > MAX_LOG_ENTRIES) {
    current.shift()
  }
  taskLogs.set(taskId, current)
}
