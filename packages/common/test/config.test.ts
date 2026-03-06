import { describe, it, expect } from 'vitest'
import { AppConfig, ProjectConfig } from '../src/index'

describe('Common Config Types', () => {
  it('should allow valid log levels', () => {
    const config: Partial<AppConfig> = {
      logs: ['info', 'error', 'success'],
    }
    expect(config.logs).toContain('info')
    expect(config.logs).toHaveLength(3)
  })

  it('should define the correct structure for ProjectConfig', () => {
    const project: ProjectConfig = {
      id: 'test',
      workspaceDir: '/tmp/project',
      pullFrom: {
        provider: 'linear',
        filters: {
          team: 'ENG',
          state: 'Todo',
          labels: ['ai-ready'],
        },
      },
      agent: { provider: 'gemini' },
    }
    expect(project.workspaceDir).toBe('/tmp/project')
    expect(project.pullFrom.provider).toBe('linear')
    expect(project.pullFrom.filters.team).toBe('ENG')
    expect(project.agent.provider).toBe('gemini')
  })

  it('should support GitHub issue sources', () => {
    const project: ProjectConfig = {
      id: 'test-github',
      workspaceDir: '/tmp/project',
      pullFrom: {
        provider: 'github',
        filters: {
          owner: 'acme',
          repo: 'platform',
          state: 'open',
          labels: ['ai-ready'],
        },
      },
      agent: { provider: 'gemini' },
    }

    expect(project.pullFrom.provider).toBe('github')
    expect(project.pullFrom.filters.owner).toBe('acme')
    expect(project.pullFrom.filters.repo).toBe('platform')
  })
})
