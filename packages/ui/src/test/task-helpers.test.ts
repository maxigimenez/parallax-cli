import { describe, expect, it } from 'vitest'
import { AGENT_PROVIDER, LOG_LEVEL, PULL_PROVIDER, TaskPlanState } from '@parallax/common'
import {
  buildTaskSummaryStatusModel,
  formatPlanStateLabel,
  planActionsState,
  projectColor,
  resolveTaskDisplayMetadata,
  resolveProjectProvider,
} from '@/lib/task-helpers'
import { TASK_STATUS } from '@/lib/task-constants'

describe('task helpers', () => {
  it('returns deterministic project color', () => {
    expect(projectColor('api')).toBe(projectColor('api'))
  })

  it('resolves provider from config', () => {
    const provider = resolveProjectProvider(
      {
        concurrency: 1,
        logs: [LOG_LEVEL.INFO],
        server: {
          apiPort: 3000,
          uiPort: 8080,
        },
        projects: [
          {
            id: 'p1',
            workspaceDir: '/tmp',
            pullFrom: { provider: PULL_PROVIDER.GITHUB, filters: {} },
            agent: {
              provider: AGENT_PROVIDER.CODEX,
            },
          },
        ],
      },
      'p1'
    )

    expect(provider).toBe(PULL_PROVIDER.GITHUB)
  })

  it('resolves task display metadata using lastAgent and configured model', () => {
    const metadata = resolveTaskDisplayMetadata(
      {
        concurrency: 1,
        logs: [LOG_LEVEL.INFO],
        server: {
          apiPort: 3000,
          uiPort: 8080,
        },
        projects: [
          {
            id: 'p1',
            workspaceDir: '/tmp',
            pullFrom: { provider: PULL_PROVIDER.GITHUB, filters: {} },
            agent: {
              provider: AGENT_PROVIDER.CODEX,
              model: 'gpt-5.4',
            },
          },
        ],
      },
      'p1',
      AGENT_PROVIDER.GEMINI
    )

    expect(metadata.provider).toBe(PULL_PROVIDER.GITHUB)
    expect(metadata.usedAi).toBe('Gemini')
    expect(metadata.model).toBe('gpt-5.4')
  })

  it('falls back to configured agent when lastAgent and model are absent', () => {
    const metadata = resolveTaskDisplayMetadata(
      {
        concurrency: 1,
        logs: [LOG_LEVEL.INFO],
        server: {
          apiPort: 3000,
          uiPort: 8080,
        },
        projects: [
          {
            id: 'p1',
            workspaceDir: '/tmp',
            pullFrom: { provider: PULL_PROVIDER.LINEAR, filters: {} },
            agent: {
              provider: AGENT_PROVIDER.CLAUDE_CODE,
            },
          },
        ],
      },
      'p1'
    )

    expect(metadata.provider).toBe(PULL_PROVIDER.LINEAR)
    expect(metadata.usedAi).toBe('Claude Code')
    expect(metadata.model).toBeUndefined()
  })

  it('allows plan actions only for approval states', () => {
    expect(planActionsState(TaskPlanState.PLAN_READY).canEdit).toBe(true)
    expect(planActionsState(TaskPlanState.PLAN_APPROVED).canEdit).toBe(false)
  })

  it('builds an approval-focused status model when a plan is waiting', () => {
    const model = buildTaskSummaryStatusModel(TASK_STATUS.QUEUED, TaskPlanState.PLAN_READY, false)

    expect(model.title).toBe('Waiting for plan approval')
    expect(model.tone).toBe('warning')
    expect(model.alert?.title).toBe('Plan approval required')
  })

  it('builds a success status model for completed PR tasks', () => {
    const model = buildTaskSummaryStatusModel(TASK_STATUS.DONE, TaskPlanState.PLAN_APPROVED, true)

    expect(model.title).toBe('Completed and delivered')
    expect(model.description).toContain('pull request')
    expect(model.tone).toBe('success')
  })

  it('formats plan state labels for display', () => {
    expect(formatPlanStateLabel(TaskPlanState.PLAN_REQUIRES_CLARIFICATION)).toBe(
      'Plan Requires Clarification'
    )
  })
})
