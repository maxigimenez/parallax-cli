import { PlanResultStatus, Task, TaskPlanState, TASK_STATUS } from '@parallax/common'

export function deriveTaskMessage(task: Task): string {
  const planState = normalizePlanState(task)

  if (task.status === TASK_STATUS.CANCELED) {
    return 'Task canceled'
  }
  if (task.status === TASK_STATUS.COMPLETED) {
    return task.prUrl ? `PR ready: ${task.prUrl}` : 'Task completed'
  }
  if (task.status === TASK_STATUS.FAILED) {
    return 'Task failed'
  }
  if (planState === TaskPlanState.PLAN_GENERATING) {
    return 'Generating execution plan'
  }
  if (planState === TaskPlanState.PLAN_FAILED) {
    return 'Plan generation failed'
  }
  if (planState === TaskPlanState.PLAN_READY) {
    return 'Awaiting plan approval'
  }
  if (planState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION) {
    return 'Plan requires clarification'
  }
  if (planState === TaskPlanState.PLAN_REJECTED) {
    return 'Plan rejected'
  }

  return 'Queued for execution'
}

export class TaskCanceledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was canceled`)
  }
}

export function throwIfCancellationRequested(taskId: string, canceledTasks: Set<string>) {
  if (canceledTasks.has(taskId)) {
    throw new TaskCanceledError(taskId)
  }
}

export function isTaskPlanState(value: string | undefined): value is TaskPlanState {
  return Object.values(TaskPlanState).includes(value as TaskPlanState)
}

export function isPlanAwaitingApproval(planState: TaskPlanState): boolean {
  return (
    planState === TaskPlanState.PLAN_READY ||
    planState === TaskPlanState.PLAN_REQUIRES_CLARIFICATION
  )
}

export function getNextPlanState(status: PlanResultStatus): TaskPlanState {
  if (status === PlanResultStatus.PLAN_READY) {
    return TaskPlanState.PLAN_READY
  }
  if (status === PlanResultStatus.NEEDS_CLARIFICATION) {
    return TaskPlanState.PLAN_REQUIRES_CLARIFICATION
  }
  return TaskPlanState.PLAN_FAILED
}

export function assertTaskPlanState(task: Task, value: string | undefined): TaskPlanState {
  if (isTaskPlanState(value)) {
    return value
  }

  throw new Error(`Task ${task.externalId} has invalid planState '${value ?? 'undefined'}'.`)
}

export function normalizePlanState(task: Task): TaskPlanState {
  return assertTaskPlanState(task, task.planState)
}

export function getTaskPlanPrompt(task: Task): string {
  return assertPlanPrompt(task.planPrompt, task.id)
}

export function assertPlanPrompt(prompt: string | undefined, taskId: string): string {
  if (!prompt) {
    throw new Error(`Task ${taskId} is missing planPrompt.`)
  }

  return prompt
}

export function isPlaceholderPlanError(error: string | undefined): boolean {
  return Boolean(error?.toLowerCase().includes('approved plan contains placeholders'))
}

export function isRetryableExecution(task: Task, maxExecutionAttempts: number): boolean {
  return (task.executionAttempts ?? 0) < maxExecutionAttempts
}

export function requiresPlan(task: Task): boolean {
  const state = normalizePlanState(task)
  return state !== TaskPlanState.NOT_REQUIRED && state !== TaskPlanState.PLAN_APPROVED
}

export function isTaskExecutable(task: Task): boolean {
  const state = normalizePlanState(task)
  return state === TaskPlanState.PLAN_APPROVED || state === TaskPlanState.NOT_REQUIRED
}
