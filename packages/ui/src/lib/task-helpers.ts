import type { AppConfig, TaskPlanState } from '@parallax/common'
import { PLAN_EDITABLE_STATES, PROJECT_COLOR_PALETTE } from './task-constants'

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
