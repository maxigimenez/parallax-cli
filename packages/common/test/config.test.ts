import { describe, expect, it } from 'vitest'
import {
  CONFIG_VERSION,
  MAX_CONCURRENT_RUNS_PER_AGENT,
  RUN_STATUS,
  TICKET_PROVIDER,
  TRIGGER_TYPE,
  isTerminalRunStatus,
  type ProjectConfig,
  type RoutingRule,
  type StoredConfig,
} from '../src/index.js'

describe('run status', () => {
  it('treats only settled statuses as terminal', () => {
    expect(isTerminalRunStatus(RUN_STATUS.COMPLETED)).toBe(true)
    expect(isTerminalRunStatus(RUN_STATUS.FAILED)).toBe(true)
    expect(isTerminalRunStatus(RUN_STATUS.CANCELED)).toBe(true)

    expect(isTerminalRunStatus(RUN_STATUS.QUEUED)).toBe(false)
    expect(isTerminalRunStatus(RUN_STATUS.RUNNING)).toBe(false)
    // A run waiting on a human is still occupying its agent.
    expect(isTerminalRunStatus(RUN_STATUS.AWAITING_APPROVAL)).toBe(false)
  })
})

describe('configuration shape', () => {
  it('describes a project without any local checkout', () => {
    const project: ProjectConfig = {
      id: 'taplands',
      provider: TICKET_PROVIDER.LINEAR,
      filters: { team: 'ENG', labels: ['feasibility'] },
    }

    expect(project).not.toHaveProperty('workspaceDir')
    expect(project).not.toHaveProperty('agent')
  })

  it('carries hermes and cloud blocks at the current version', () => {
    const config: StoredConfig = {
      version: CONFIG_VERSION,
      cloud: { baseUrl: 'https://cloud', apiKey: 'prx_rnr_x', runnerName: 'cerebro' },
      hermes: {
        baseUrl: 'http://127.0.0.1:8642',
        profiles: [{ name: 'product', apiKey: 'k', enabled: true }],
      },
      projects: [{ id: 'p', provider: TICKET_PROVIDER.GITHUB, filters: { owner: 'a', repo: 'b' } }],
      secrets: {},
      updatedAt: 0,
    }

    expect(config.version).toBe(2)
    expect(config.hermes?.profiles[0].apiKey).toBe('k')
  })
})

describe('routing rule shape', () => {
  it('expresses a label-triggered analysis route', () => {
    const route: RoutingRule = {
      id: 'rt_1',
      name: 'Product review',
      priority: 100,
      enabled: true,
      trigger: {
        type: TRIGGER_TYPE.TICKET,
        provider: TICKET_PROVIDER.LINEAR,
        projectId: 'taplands',
      },
      match: { labels: { any: ['feasibility'] } },
      target: { agentRef: { profile: 'product' } },
      execution: { promptTemplate: 'product-review', requireApproval: false, timeoutSeconds: 1800 },
      outcome: { postComment: { target: 'ticket' } },
    }

    expect(route.target.agentRef.profile).toBe('product')
    // No workspace field: what the agent does with a repo is Hermes' business.
    expect(route.execution).not.toHaveProperty('workspace')
  })

  it('expresses a reviewer-assignment route addressed by github identity', () => {
    const route: RoutingRule = {
      id: 'rt_2',
      name: 'PR review',
      priority: 50,
      enabled: true,
      trigger: { type: TRIGGER_TYPE.PR_REVIEW_REQUESTED, projectId: 'taplands' },
      match: {},
      target: { agentRef: { githubLogin: 'acme-reviewer-bot' } },
      execution: { promptTemplate: 'pr-review', requireApproval: false, timeoutSeconds: 900 },
      outcome: { postComment: { target: 'pr' } },
    }

    expect(route.target.agentRef.githubLogin).toBe('acme-reviewer-bot')
  })
})

describe('concurrency guard', () => {
  it('allows exactly one run per agent, per the Hermes profile constraint', () => {
    expect(MAX_CONCURRENT_RUNS_PER_AGENT).toBe(1)
  })
})
