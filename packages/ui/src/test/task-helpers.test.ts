import { describe, expect, it } from 'vitest'
import { planActionsState, projectColor, resolveProjectProvider } from '@/lib/task-helpers'

describe('task helpers', () => {
  it('returns deterministic project color', () => {
    expect(projectColor('api')).toBe(projectColor('api'))
  })

  it('resolves provider from config', () => {
    const provider = resolveProjectProvider(
      {
        concurrency: 1,
        logs: ['info'],
        server: {
          apiPort: 3000,
          uiPort: 8080,
        },
        projects: [
          {
            id: 'p1',
            workspaceDir: '/tmp',
            pullFrom: { provider: 'github', filters: {} },
            agent: { provider: 'codex' },
          },
        ],
      },
      'p1'
    )

    expect(provider).toBe('github')
  })

  it('allows plan actions only for approval states', () => {
    expect(planActionsState('PLAN_READY').canEdit).toBe(true)
    expect(planActionsState('PLAN_APPROVED').canEdit).toBe(false)
  })
})
