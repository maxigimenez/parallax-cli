import {
  TASK_REVIEW_STATE,
  TASK_RUNTIME_STATUS,
  TaskPlanState,
  type TaskReviewState,
  type TaskRuntimeStatus,
} from '@parallax/common'

export const TASK_STATUS = TASK_RUNTIME_STATUS

export type TaskStatus = TaskRuntimeStatus

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TASK_STATUS.QUEUED]: 'Queue',
  [TASK_STATUS.RUNNING]: 'In Progress',
  [TASK_STATUS.CANCELED]: 'Cancelled',
  [TASK_STATUS.FAILED]: 'Error',
  [TASK_STATUS.DONE]: 'Done',
}

export const PLAN_STATE = TaskPlanState

export type UiTaskPlanState = TaskPlanState

export { TASK_REVIEW_STATE }

export type { TaskReviewState }

export const PLAN_EDITABLE_STATES = new Set<TaskPlanState>([
  PLAN_STATE.PLAN_READY,
  PLAN_STATE.PLAN_REQUIRES_CLARIFICATION,
])

export const PROJECT_COLOR_PALETTE = [
  '#4ade80',
  '#60a5fa',
  '#f59e0b',
  '#22d3ee',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fb7185',
] as const
