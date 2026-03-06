export const TASK_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  CANCELED: 'canceled',
  FAILED: 'failed',
  DONE: 'done',
} as const

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TASK_STATUS.QUEUED]: 'Queue',
  [TASK_STATUS.RUNNING]: 'In Progress',
  [TASK_STATUS.CANCELED]: 'Cancelled',
  [TASK_STATUS.FAILED]: 'Error',
  [TASK_STATUS.DONE]: 'Done',
}

export const PLAN_STATE = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PLAN_GENERATING: 'PLAN_GENERATING',
  PLAN_READY: 'PLAN_READY',
  PLAN_REQUIRES_CLARIFICATION: 'PLAN_REQUIRES_CLARIFICATION',
  PLAN_APPROVED: 'PLAN_APPROVED',
  PLAN_REJECTED: 'PLAN_REJECTED',
  PLAN_FAILED: 'PLAN_FAILED',
} as const

export type TaskPlanState = (typeof PLAN_STATE)[keyof typeof PLAN_STATE]

export const REVIEW_STATE = {
  NONE: 'NONE',
  WAITING_FOR_REVIEW: 'WAITING_FOR_REVIEW',
  REVIEW_PENDING: 'REVIEW_PENDING',
  SYNCING_MAIN: 'SYNCING_MAIN',
  RESOLVING_CONFLICTS: 'RESOLVING_CONFLICTS',
  APPLYING_REVIEW: 'APPLYING_REVIEW',
  REVISION_PUSHED: 'REVISION_PUSHED',
} as const

export type TaskReviewState = (typeof REVIEW_STATE)[keyof typeof REVIEW_STATE]

export const PLAN_EDITABLE_STATES = new Set<string>([
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
