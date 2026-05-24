import path from 'node:path'
import {
  AppConfig,
  PULL_PROVIDER,
  ProjectConfig,
  SlackConfig,
  StoredConfig,
} from '@parallax/common'

const ALLOWED_AGENT_PROVIDERS = ['codex', 'gemini', 'claude-code'] as const

const ALLOWED_PULL_PROVIDERS = [PULL_PROVIDER.LINEAR, PULL_PROVIDER.GITHUB] as const

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value.trim()
}

function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return assertNonEmptyString(value, label)
}

export function validateSlack(raw: unknown): SlackConfig {
  assertObject(raw, 'slack')
  const botToken = assertNonEmptyString(raw.botToken, 'slack.botToken')
  const appToken = assertNonEmptyString(raw.appToken, 'slack.appToken')
  const channel = assertNonEmptyString(raw.channel, 'slack.channel')
  if (!botToken.startsWith('xoxb-')) {
    throw new Error('slack.botToken must start with xoxb-')
  }
  if (!appToken.startsWith('xapp-')) {
    throw new Error('slack.appToken must start with xapp-')
  }
  return { botToken, appToken, channel }
}

export function validateProject(raw: unknown): ProjectConfig {
  assertObject(raw, 'project')

  const id = assertNonEmptyString(raw.id, 'project.id')
  const workspaceDir = assertNonEmptyString(raw.workspaceDir, `project.workspaceDir for "${id}"`)
  if (!path.isAbsolute(workspaceDir)) {
    throw new Error(`project.workspaceDir for "${id}" must be an absolute path.`)
  }

  const pullFrom = raw.pullFrom
  assertObject(pullFrom, `project.pullFrom for "${id}"`)
  const provider = assertNonEmptyString(pullFrom.provider, `project.pullFrom.provider for "${id}"`)
  if (!ALLOWED_PULL_PROVIDERS.includes(provider as ProjectConfig['pullFrom']['provider'])) {
    throw new Error(`Unsupported pull provider "${provider}" for project "${id}".`)
  }

  const filtersRaw = pullFrom.filters
  assertObject(filtersRaw, `project.pullFrom.filters for "${id}"`)
  const filters = filtersRaw as ProjectConfig['pullFrom']['filters']
  if (provider === PULL_PROVIDER.GITHUB) {
    assertNonEmptyString(filters.owner, `project.pullFrom.filters.owner for "${id}"`)
    assertNonEmptyString(filters.repo, `project.pullFrom.filters.repo for "${id}"`)
  }

  const agentRaw = raw.agent
  assertObject(agentRaw, `project.agent for "${id}"`)

  const agentProviderRaw = assertNonEmptyString(
    agentRaw.provider,
    `project.agent.provider for "${id}"`
  )
  if (
    !ALLOWED_AGENT_PROVIDERS.includes(agentProviderRaw as (typeof ALLOWED_AGENT_PROVIDERS)[number])
  ) {
    throw new Error(
      `Unsupported agent provider "${agentProviderRaw}" for project "${id}". Supported: ${ALLOWED_AGENT_PROVIDERS.join(', ')}.`
    )
  }

  return {
    id,
    workspaceDir,
    pullFrom: {
      provider: provider as ProjectConfig['pullFrom']['provider'],
      filters,
    },
    agent: {
      provider: agentProviderRaw as ProjectConfig['agent']['provider'],
      model: assertOptionalString(agentRaw.model, `project.agent.model for "${id}"`),
    },
  }
}

export function validateStoredConfig(stored: StoredConfig): Pick<AppConfig, 'projects' | 'slack'> {
  const projectIds = new Set<string>()
  const projects: ProjectConfig[] = []
  for (const raw of stored.projects) {
    const project = validateProject(raw)
    if (projectIds.has(project.id)) {
      throw new Error(`Duplicate project id "${project.id}".`)
    }
    projectIds.add(project.id)
    projects.push(project)
  }

  const slack = stored.slack ? validateSlack(stored.slack) : undefined

  return { projects, slack }
}
