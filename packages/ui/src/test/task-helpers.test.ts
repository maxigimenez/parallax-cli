import { describe, expect, it } from 'vitest'
import { AGENT_PROVIDER, APPROVAL_MODE, LOG_LEVEL, PULL_PROVIDER, TaskPlanState } from '@parallax/common'
import { planActionsState, projectColor, resolveProjectProvider } from '@/lib/task-helpers'

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
              approvalMode: APPROVAL_MODE.DEFAULT,
              sandbox: true,
              disableMcp: false,
            },
          },
        ],
      },
      'p1'
    )

    expect(provider).toBe(PULL_PROVIDER.GITHUB)
  })

  it('allows plan actions only for approval states', () => {
    expect(planActionsState(TaskPlanState.PLAN_READY).canEdit).toBe(true)
    expect(planActionsState(TaskPlanState.PLAN_APPROVED).canEdit).toBe(false)
  })
})
