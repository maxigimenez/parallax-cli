import type { AppConfig, TaskPlanState } from '@parallax/common'
import { PLAN_EDITABLE_STATES, PROJECT_COLOR_PALETTE } from './task-constants'
import { PLAN_STATE, TASK_STATUS, type TaskStatus } from './task-constants'

export function projectColor(projectId: string): string {
  let hash = 0
  for (let i = 0; i < projectId.length; i += 1) {
    hash = (hash << 5) - hash + projectId.charCodeAt(i)
    hash |= 0
  }

  const index = Math.abs(hash) % PROJECT_COLOR_PALETTE.length
  return PROJECT_COLOR_PALETTE[index]
}

export function resolveProjectProvider(config: AppConfig | null, projectId?: string): string {
  if (!config) {
    throw new Error('Parallax config is not loaded.')
  }

  if (!projectId) {
    throw new Error('Task is missing projectId.')
  }

  const project = config.projects.find((candidate) => candidate.id === projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" is not present in config.`)
  }

  return project.pullFrom.provider
}

export function planActionsState(planState?: TaskPlanState) {
  if (!planState) {
    return { canEdit: false, reason: 'Plan is not available for this task.' }
  }

  if (PLAN_EDITABLE_STATES.has(planState)) {
    return { canEdit: true, reason: '' }
  }

  return {
    canEdit: false,
    reason: 'Plan actions are only available while approval is pending.',
  }
}

export function formatPlanStateLabel(planState: TaskPlanState) {
  return planState
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

type SummaryTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type TaskSummaryStatusModel = {
  title: string
  description: string
  tone: SummaryTone
  alert?: {
    title: string
    description: string
  }
}

export function buildTaskSummaryStatusModel(
  status: TaskStatus,
  planState?: TaskPlanState,
  hasPullRequest?: boolean
): TaskSummaryStatusModel {
  if (
    planState === PLAN_STATE.PLAN_READY ||
    planState === PLAN_STATE.PLAN_REQUIRES_CLARIFICATION
  ) {
    return {
      title: 'Waiting for plan approval',
      description: 'Execution is paused until the plan is approved or rejected.',
      tone: 'warning',
      alert: {
        title:
          planState === PLAN_STATE.PLAN_REQUIRES_CLARIFICATION
            ? 'Plan requires clarification'
            : 'Plan approval required',
        description:
          planState === PLAN_STATE.PLAN_REQUIRES_CLARIFICATION
            ? 'Review the open clarifications before approving execution.'
            : 'Review the proposed plan before execution can continue.',
      },
    }
  }

  if (planState === PLAN_STATE.PLAN_GENERATING) {
    return {
      title: 'Generating plan',
      description: 'Parallax is preparing the execution plan for this task.',
      tone: 'info',
    }
  }

  switch (status) {
    case TASK_STATUS.QUEUED:
      return {
        title: 'Queued for execution',
        description: 'This task is waiting for an available execution slot.',
        tone: 'neutral',
      }
    case TASK_STATUS.RUNNING:
      return {
        title: 'Running',
        description: 'Parallax is actively working on this task.',
        tone: 'info',
      }
    case TASK_STATUS.DONE:
      return {
        title: hasPullRequest ? 'Completed and delivered' : 'Completed',
        description: hasPullRequest
          ? 'Implementation finished and a pull request is ready for review.'
          : 'Task completed successfully.',
        tone: 'success',
      }
    case TASK_STATUS.FAILED:
      return {
        title: 'Failed',
        description: 'Execution stopped before completion. Review the logs for the blocking issue.',
        tone: 'danger',
      }
    case TASK_STATUS.CANCELED:
      return {
        title: 'Canceled',
        description: 'This task was canceled before completion.',
        tone: 'warning',
      }
  }
}
