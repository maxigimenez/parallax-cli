import { TaskPlanState, TaskStatus } from '@parallax/common'
import { dbService } from './database.js'
import {
  clearTaskState,
  setTaskCanceled,
  setTaskDone,
  setTaskFailed,
  setTaskQueued,
  setTaskRunning,
} from './logger.js'

const COMPLETED_TASK_TTL_MS = 60_000

function persistStatus(taskId: string, status: TaskStatus) {
  dbService.updateTaskStatus(taskId, status)
}

export const taskLifecycle = {
  queue(taskId: string, message: string) {
    persistStatus(taskId, 'PENDING')
    setTaskQueued(taskId, message)
  },

  run(taskId: string, message: string) {
    persistStatus(taskId, 'IN_PROGRESS')
    setTaskRunning(taskId, message)
  },

  fail(taskId: string, message: string, planState?: TaskPlanState) {
    if (planState) {
      dbService.updateTaskPlanState(taskId, planState)
    }
    persistStatus(taskId, 'FAILED')
    setTaskFailed(taskId, message)
  },

  cancel(taskId: string, message: string) {
    persistStatus(taskId, 'CANCELED')
    setTaskCanceled(taskId, message)
  },

  complete(taskId: string, message: string) {
    persistStatus(taskId, 'COMPLETED')
    setTaskDone(taskId, message)
    setTimeout(() => {
      clearTaskState(taskId)
    }, COMPLETED_TASK_TTL_MS)
  },
}
