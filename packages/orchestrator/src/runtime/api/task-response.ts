import {
  TASK_LOG_KIND,
  TASK_LOG_SOURCE,
  TASK_RUNTIME_STATUS,
  TASK_STATUS,
  Task,
  type TaskLogEntry,
  type TaskRuntimeStatus,
} from '@parallax/common'
import { dbService } from '../../database.js'
import { getTaskStatuses } from '../../logger.js'
import { deriveTaskMessage, normalizePlanState } from '../../workflow/task-state.js'

const taskLogKinds = new Set(Object.values(TASK_LOG_KIND))
const taskLogSources = new Set(Object.values(TASK_LOG_SOURCE))

export function mapTaskStatusToRuntimeStatus(status: Task['status']): TaskRuntimeStatus {
  switch (status) {
    case TASK_STATUS.PENDING:
      return TASK_RUNTIME_STATUS.QUEUED
    case TASK_STATUS.IN_PROGRESS:
      return TASK_RUNTIME_STATUS.RUNNING
    case TASK_STATUS.COMPLETED:
      return TASK_RUNTIME_STATUS.DONE
    case TASK_STATUS.FAILED:
      return TASK_RUNTIME_STATUS.FAILED
    case TASK_STATUS.CANCELED:
      return TASK_RUNTIME_STATUS.CANCELED
  }
}

function getTaskReviewState(task: Task) {
  if (!task.reviewState) {
    throw new Error(`Task ${task.id} is missing reviewState.`)
  }

  return task.reviewState
}

function getTaskExecutionAttempts(task: Task) {
  if (task.executionAttempts === undefined || task.executionAttempts === null) {
    throw new Error(`Task ${task.id} is missing executionAttempts.`)
  }

  return task.executionAttempts
}

function resolveTaskLogs(taskId: string) {
  const persistedLogs = dbService.getLogsByTaskExternalId(taskId)
  return persistedLogs.map((entry): TaskLogEntry => {
    return {
      ...entry,
      kind: taskLogKinds.has(entry.kind as TaskLogEntry['kind'])
        ? (entry.kind as TaskLogEntry['kind'])
        : TASK_LOG_KIND.LIFECYCLE,
      source: taskLogSources.has(entry.source as TaskLogEntry['source'])
        ? (entry.source as TaskLogEntry['source'])
        : TASK_LOG_SOURCE.SYSTEM,
      groupId: entry.groupId ?? undefined,
    }
  })
}

export function serializeTaskForApi(task: Task) {
  const liveInfo = getTaskStatuses().get(task.id)
  return {
    ...task,
    planState: normalizePlanState(task),
    executionAttempts: getTaskExecutionAttempts(task),
    reviewState: getTaskReviewState(task),
    msg: liveInfo?.msg ?? deriveTaskMessage(task),
    startTime: liveInfo?.startTime ?? task.updatedAt,
    status: liveInfo?.status ?? mapTaskStatusToRuntimeStatus(task.status),
    logs: resolveTaskLogs(task.id),
  }
}
