import { describe, it, expect } from 'vitest'
import { resolveAgentNameForTask, resolveAgentForTask } from '../src/runtime/provider-services'
import type { AppConfig, ProjectConfig, Task } from '@parallax/common'

const baseProject: ProjectConfig = {
  id: 'p1',
  workspaceDir: '/tmp/repo',
  pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
  agent: { provider: 'codex', name: 'developer' },
}

const baseConfig: AppConfig = {
  projects: [],
  agents: [
    { name: 'developer', provider: 'codex' },
    { name: 'reviewer', provider: 'gemini', model: 'gemini-2.5-pro' },
  ],
  concurrency: 2,
  logs: ['info', 'success', 'warn', 'error'],
  server: { apiPort: 3000, uiPort: 8080 },
}

describe('resolveAgentNameForTask', () => {
  it('returns the matching agent name when a task label matches agentLabels', () => {
    const project: ProjectConfig = {
      ...baseProject,
      agentLabels: { 'ai-frontend': 'reviewer' },
    }
    const result = resolveAgentNameForTask(['ai-ready', 'ai-frontend'], project, baseConfig)
    expect(result).toBe('reviewer')
  })

  it('returns the first matching label when multiple labels match', () => {
    const project: ProjectConfig = {
      ...baseProject,
      agentLabels: { 'ai-frontend': 'reviewer', 'ai-security': 'reviewer' },
    }
    const result = resolveAgentNameForTask(['ai-security'], project, baseConfig)
    expect(result).toBe('reviewer')
  })

  it('falls back to project.agent.name when no label matches', () => {
    const project: ProjectConfig = {
      ...baseProject,
      agentLabels: { 'ai-frontend': 'reviewer' },
    }
    const result = resolveAgentNameForTask(['ai-ready'], project, baseConfig)
    expect(result).toBe('developer')
  })

  it('returns project.agent.name when agentLabels is undefined', () => {
    const result = resolveAgentNameForTask(['ai-ready'], baseProject, baseConfig)
    expect(result).toBe('developer')
  })

  it('returns undefined when no label matches and project has no agent name', () => {
    const project: ProjectConfig = {
      ...baseProject,
      agent: { provider: 'codex' },
    }
    const result = resolveAgentNameForTask(['ai-ready'], project, baseConfig)
    expect(result).toBeUndefined()
  })

  it('returns undefined when task has no labels and no default agent name', () => {
    const project: ProjectConfig = {
      ...baseProject,
      agent: { provider: 'codex' },
    }
    const result = resolveAgentNameForTask([], project, baseConfig)
    expect(result).toBeUndefined()
  })
})

describe('resolveAgentForTask', () => {
  const baseTask: Task = {
    id: 't1',
    externalId: 'ORG/REPO#1',
    title: 'Test',
    description: '',
    status: 'PENDING',
    projectId: 'p1',
    createdAt: 0,
    updatedAt: 0,
  }

  it('merges named agent definition into project when task.agentName matches', () => {
    const task: Task = { ...baseTask, agentName: 'reviewer' }
    const result = resolveAgentForTask(task, baseProject, baseConfig)

    expect(result.agent.provider).toBe('gemini')
    expect(result.agent.model).toBe('gemini-2.5-pro')
    expect(result.agent.name).toBe('reviewer')
  })

  it('falls back to project.agent.name when task.agentName is undefined', () => {
    const configWithSystemPrompt: AppConfig = {
      ...baseConfig,
      agents: [
        { name: 'developer', provider: 'codex', systemPrompt: 'Be concise.' },
        { name: 'reviewer', provider: 'gemini' },
      ],
    }
    const result = resolveAgentForTask(baseTask, baseProject, configWithSystemPrompt)

    expect(result.agent.provider).toBe('codex')
    expect(result.agent.systemPrompt).toBe('Be concise.')
  })

  it('prefers project.agent.model over named agent model when both set', () => {
    const project: ProjectConfig = {
      ...baseProject,
      agent: { provider: 'gemini', name: 'reviewer', model: 'gemini-1.5-flash' },
    }
    const task: Task = { ...baseTask, agentName: 'reviewer' }
    const result = resolveAgentForTask(task, project, baseConfig)

    expect(result.agent.model).toBe('gemini-1.5-flash')
  })

  it('returns project unchanged when no agent name on task or project', () => {
    const project: ProjectConfig = { ...baseProject, agent: { provider: 'codex' } }
    const result = resolveAgentForTask(baseTask, project, baseConfig)

    expect(result).toBe(project)
  })

  it('returns project unchanged when named agent is not found in config', () => {
    const task: Task = { ...baseTask, agentName: 'ghost-agent' }
    const result = resolveAgentForTask(task, baseProject, baseConfig)

    expect(result).toBe(baseProject)
  })
})
