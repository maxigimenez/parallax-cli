import { describe, it, expect } from 'vitest'
import { AGENT_PROVIDER, AppConfig, LOG_LEVEL, ProjectConfig, PULL_PROVIDER } from '../src/index'

describe('Common Config Types', () => {
  it('should allow valid log levels', () => {
    const config: Partial<AppConfig> = {
      logs: [LOG_LEVEL.INFO, LOG_LEVEL.ERROR, LOG_LEVEL.SUCCESS],
    }
    expect(config.logs).toContain('info')
    expect(config.logs).toHaveLength(3)
  })

  it('should define the correct structure for ProjectConfig', () => {
    const project: ProjectConfig = {
      id: 'test',
      workspaceDir: '/tmp/project',
      pullFrom: {
        provider: PULL_PROVIDER.LINEAR,
        filters: {
          team: 'ENG',
          state: 'Todo',
          labels: ['ai-ready'],
        },
      },
      agent: {
        provider: AGENT_PROVIDER.GEMINI,
        model: 'gemini-2.5-pro',
      },
    }
    expect(project.workspaceDir).toBe('/tmp/project')
    expect(project.pullFrom.provider).toBe(PULL_PROVIDER.LINEAR)
    expect(project.pullFrom.filters.team).toBe('ENG')
    expect(project.agent.provider).toBe(AGENT_PROVIDER.GEMINI)
  })

  it('should support GitHub issue sources', () => {
    const project: ProjectConfig = {
      id: 'test-github',
      workspaceDir: '/tmp/project',
      pullFrom: {
        provider: PULL_PROVIDER.GITHUB,
        filters: {
          owner: 'acme',
          repo: 'platform',
          state: 'open',
          labels: ['ai-ready'],
        },
      },
      agent: {
        provider: AGENT_PROVIDER.GEMINI,
        model: 'gemini-2.5-pro',
      },
    }

    expect(project.pullFrom.provider).toBe(PULL_PROVIDER.GITHUB)
    expect(project.pullFrom.filters.owner).toBe('acme')
    expect(project.pullFrom.filters.repo).toBe('platform')
  })
})
