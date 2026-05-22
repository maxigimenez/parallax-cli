import path from 'node:path'
import {
  AGENT_PROVIDER,
  AgentDefinition,
  AppConfig,
  PULL_PROVIDER,
  ProjectConfig,
  SlackConfig,
  StoredConfig,
} from '@parallax/common'

const ALLOWED_AGENT_PROVIDERS = [
  AGENT_PROVIDER.CODEX,
  AGENT_PROVIDER.GEMINI,
  AGENT_PROVIDER.CLAUDE_CODE,
] as const

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

export function validateAgent(
  raw: unknown,
  index: number,
  knownNames: Set<string>
): AgentDefinition {
  assertObject(raw, `agents[${index}]`)
  const name = assertNonEmptyString(raw.name, `agents[${index}].name`)
  if (knownNames.has(name)) {
    throw new Error(`Duplicate agent name "${name}".`)
  }
  const providerRaw = assertNonEmptyString(raw.provider, `agents[${index}].provider`)
  if (!ALLOWED_AGENT_PROVIDERS.includes(providerRaw as (typeof ALLOWED_AGENT_PROVIDERS)[number])) {
    throw new Error(`Unsupported agent provider "${providerRaw}" for agent "${name}".`)
  }
  return {
    name,
    provider: providerRaw as AgentDefinition['provider'],
    model: assertOptionalString(raw.model, `agents[${index}].model`),
    systemPrompt: assertOptionalString(raw.systemPrompt, `agents[${index}].systemPrompt`),
  }
}

export function validateAgents(raw: unknown): AgentDefinition[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const names = new Set<string>()
  return raw.map((entry, i) => {
    const agent = validateAgent(entry, i, names)
    names.add(agent.name)
    return agent
  })
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

export function validateProject(raw: unknown, agents: AgentDefinition[]): ProjectConfig {
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

  const agentName = assertOptionalString(agentRaw.name, `project.agent.name for "${id}"`)
  const knownAgentNames = new Set(agents.map((a) => a.name))

  let agentProvider: ProjectConfig['agent']['provider']
  let agentModel: string | undefined
  let agentSystemPrompt: string | undefined

  if (agentName) {
    const namedAgent = agents.find((a) => a.name === agentName)
    if (!namedAgent) {
      throw new Error(`project.agent.name "${agentName}" for "${id}" references an unknown agent.`)
    }
    agentProvider = namedAgent.provider
    agentModel =
      assertOptionalString(agentRaw.model, `project.agent.model for "${id}"`) ?? namedAgent.model
    agentSystemPrompt = namedAgent.systemPrompt
  } else {
    const agentProviderRaw = assertNonEmptyString(
      agentRaw.provider,
      `project.agent.provider for "${id}" (required when agent.name is not set)`
    )
    if (
      !ALLOWED_AGENT_PROVIDERS.includes(
        agentProviderRaw as (typeof ALLOWED_AGENT_PROVIDERS)[number]
      )
    ) {
      throw new Error(
        `Unsupported agent provider "${agentProviderRaw}" for project "${id}". Supported: ${ALLOWED_AGENT_PROVIDERS.join(', ')}.`
      )
    }
    agentProvider = agentProviderRaw as ProjectConfig['agent']['provider']
    agentModel = assertOptionalString(agentRaw.model, `project.agent.model for "${id}"`)
  }

  const agentLabelsRaw = raw.agentLabels
  let agentLabels: Record<string, string> | undefined
  if (agentLabelsRaw !== undefined) {
    assertObject(agentLabelsRaw, `project.agentLabels for "${id}"`)
    agentLabels = {}
    for (const [label, name] of Object.entries(agentLabelsRaw)) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`project.agentLabels["${label}"] for "${id}" must be a non-empty string.`)
      }
      if (knownAgentNames.size > 0 && !knownAgentNames.has(name.trim())) {
        throw new Error(
          `project.agentLabels["${label}"] for "${id}" references unknown agent "${name}".`
        )
      }
      agentLabels[label] = name.trim()
    }
    if (Object.keys(agentLabels).length === 0) {
      agentLabels = undefined
    }
  }

  return {
    id,
    workspaceDir,
    pullFrom: {
      provider: provider as ProjectConfig['pullFrom']['provider'],
      filters,
    },
    agent: {
      provider: agentProvider,
      model: agentModel,
      name: agentName,
      systemPrompt: agentSystemPrompt,
    },
    agentLabels,
  }
}

export function validateStoredConfig(
  stored: StoredConfig
): Pick<AppConfig, 'projects' | 'agents' | 'slack'> {
  const agents = validateAgents(stored.agents)

  const projectIds = new Set<string>()
  const projects: ProjectConfig[] = []
  for (const raw of stored.projects) {
    const project = validateProject(raw, agents)
    if (projectIds.has(project.id)) {
      throw new Error(`Duplicate project id "${project.id}".`)
    }
    projectIds.add(project.id)
    projects.push(project)
  }

  const slack = stored.slack ? validateSlack(stored.slack) : undefined

  return { projects, agents, slack }
}
