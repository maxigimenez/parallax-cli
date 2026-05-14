import fs from 'fs/promises'
import yaml from 'js-yaml'
import path from 'path'
import os from 'os'
import dotenv from 'dotenv'
import {
  AGENT_PROVIDER,
  AgentDefinition,
  AppConfig,
  DEFAULT_API_PORT,
  DEFAULT_UI_PORT,
  LOG_LEVEL,
  LogLevel,
  PULL_PROVIDER,
  ProjectConfig,
  ServerConfig,
  SlackConfig,
} from '@parallax/common'
type RegisteredConfig = {
  configPath: string
  addedAt: number
  envFilePath?: string
}

type RegistryState = {
  configs: RegisteredConfig[]
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function resolveDataDir(): string {
  return process.env.PARALLAX_DATA_DIR
    ? path.resolve(process.env.PARALLAX_DATA_DIR)
    : path.join(os.homedir(), '.parallax')
}

export async function loadConfig(): Promise<AppConfig> {
  const dataDir = resolveDataDir()
  const registryPath = path.join(dataDir, 'registry.json')
  if (!(await fileExists(registryPath))) {
    return buildEmptyConfig()
  }

  const registry = parseRegistry(await fs.readFile(registryPath, 'utf8'), registryPath)
  if (registry.configs.length === 0) {
    return buildEmptyConfig()
  }

  const configs = await Promise.all(
    registry.configs.map(async (entry) => {
      if (!(await fileExists(entry.configPath))) {
        throw new Error(`Registered config file not found: ${entry.configPath}`)
      }
      if (entry.envFilePath) {
        if (!(await fileExists(entry.envFilePath))) {
          throw new Error(`Registered env file not found: ${entry.envFilePath}`)
        }
        const envContent = await fs.readFile(entry.envFilePath, 'utf8')
        const envValues = dotenv.parse(envContent)
        for (const [key, value] of Object.entries(envValues)) {
          if (process.env[key] === undefined) {
            process.env[key] = value
          }
        }
      }

      const fileContent = await fs.readFile(entry.configPath, 'utf8')
      const parsed = yaml.load(fileContent)
      return validateConfig(parsed, entry.configPath, entry.envFilePath)
    })
  )

  return mergeConfigs(configs)
}

const ALLOWED_LOG_LEVELS: LogLevel[] = Object.values(LOG_LEVEL)
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

function assertNoUnknownKeys(value: Record<string, unknown>, allowedKeys: string[], label: string) {
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key))
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unknownKeys.join(', ')}.`)
  }
}

function parseLogs(raw: unknown, source: string): LogLevel[] {
  if (raw === undefined) {
    return ['info', 'success', 'warn', 'error']
  }

  if (!Array.isArray(raw)) {
    throw new Error(`logs in ${source} must be an array.`)
  }

  const parsed = raw.map((entry) => assertNonEmptyString(entry, `logs entry in ${source}`))
  for (const level of parsed) {
    if (!ALLOWED_LOG_LEVELS.includes(level as LogLevel)) {
      throw new Error(`Unsupported log level "${level}" in ${source}.`)
    }
  }

  return [...new Set(parsed)] as LogLevel[]
}

function parseRuntimeConcurrency(): number {
  const raw = process.env.PARALLAX_CONCURRENCY
  if (raw === undefined) {
    return 2
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) {
    throw new Error('PARALLAX_CONCURRENCY must be an integer between 1 and 16.')
  }

  return parsed
}

function parseRuntimePort(raw: string | undefined, label: string, fallback: number): number {
  if (raw === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`)
  }

  return parsed
}

function parseRuntimeServerConfig(): ServerConfig {
  const apiPort = parseRuntimePort(
    process.env.PARALLAX_SERVER_API_PORT,
    'PARALLAX_SERVER_API_PORT',
    DEFAULT_API_PORT
  )
  const uiPort = parseRuntimePort(
    process.env.PARALLAX_SERVER_UI_PORT,
    'PARALLAX_SERVER_UI_PORT',
    DEFAULT_UI_PORT
  )

  if (apiPort === uiPort) {
    throw new Error('PARALLAX_SERVER_API_PORT and PARALLAX_SERVER_UI_PORT must be different.')
  }

  return { apiPort, uiPort }
}

function buildEmptyConfig(): AppConfig {
  return {
    concurrency: parseRuntimeConcurrency(),
    logs: ['info', 'success', 'warn', 'error'],
    server: parseRuntimeServerConfig(),
    projects: [],
    agents: [],
  }
}

function parseRegistry(raw: string, source: string): RegistryState {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid config registry at ${source}: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error }
    )
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { configs?: unknown }).configs)
  ) {
    throw new Error(`Invalid config registry at ${source}.`)
  }

  return {
    configs: (parsed as { configs: unknown[] }).configs.map((entry, index) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as { configPath?: unknown }).configPath !== 'string' ||
        typeof (entry as { addedAt?: unknown }).addedAt !== 'number' ||
        ('envFilePath' in entry &&
          (entry as { envFilePath?: unknown }).envFilePath !== undefined &&
          typeof (entry as { envFilePath?: unknown }).envFilePath !== 'string')
      ) {
        throw new Error(`Invalid config registry entry ${index + 1} in ${source}.`)
      }

      return {
        configPath: (entry as { configPath: string }).configPath,
        addedAt: (entry as { addedAt: number }).addedAt,
        envFilePath: (entry as { envFilePath?: string }).envFilePath?.trim() || undefined,
      }
    }),
  }
}

function parseAgentDefinitions(raw: unknown, source: string): AgentDefinition[] {
  if (!Array.isArray(raw)) {
    throw new Error(`agents in ${source} must be an array.`)
  }

  const names = new Set<string>()
  return raw.map((entry, index) => {
    assertObject(entry, `agents[${index}] in ${source}`)
    assertNoUnknownKeys(
      entry,
      ['name', 'provider', 'model', 'systemPrompt'],
      `agents[${index}] in ${source}`
    )
    const name = assertNonEmptyString(entry.name, `agents[${index}].name in ${source}`)
    if (names.has(name)) {
      throw new Error(`Duplicate agent name "${name}" in ${source}.`)
    }
    names.add(name)

    const providerRaw = assertNonEmptyString(
      entry.provider,
      `agents[${index}].provider in ${source}`
    )
    if (!ALLOWED_AGENT_PROVIDERS.includes(providerRaw as (typeof ALLOWED_AGENT_PROVIDERS)[number])) {
      throw new Error(
        `Unsupported agent provider "${providerRaw}" for agent "${name}" in ${source}.`
      )
    }

    return {
      name,
      provider: providerRaw as AgentDefinition['provider'],
      model: assertOptionalString(entry.model, `agents[${index}].model in ${source}`),
      systemPrompt: assertOptionalString(
        entry.systemPrompt,
        `agents[${index}].systemPrompt in ${source}`
      ),
    }
  })
}

function parseSlackConfig(raw: unknown, source: string): SlackConfig {
  assertObject(raw, `slack in ${source}`)
  assertNoUnknownKeys(raw, ['botToken', 'appToken', 'channel'], `slack in ${source}`)
  const botToken = assertNonEmptyString(raw.botToken, `slack.botToken in ${source}`)
  const appToken = assertNonEmptyString(raw.appToken, `slack.appToken in ${source}`)
  const channel = assertNonEmptyString(raw.channel, `slack.channel in ${source}`)
  if (!botToken.startsWith('xoxb-')) {
    throw new Error(`slack.botToken in ${source} must start with xoxb-`)
  }
  if (!appToken.startsWith('xapp-')) {
    throw new Error(`slack.appToken in ${source} must start with xapp-`)
  }
  return { botToken, appToken, channel }
}

function parseAgentLabels(
  raw: unknown,
  projectId: string,
  source: string,
  knownAgentNames: Set<string>
): Record<string, string> {
  if (raw === undefined) return {}
  assertObject(raw, `project.agentLabels for "${projectId}" in ${source}`)
  const result: Record<string, string> = {}
  for (const [label, agentName] of Object.entries(raw)) {
    if (typeof agentName !== 'string' || !agentName.trim()) {
      throw new Error(
        `project.agentLabels["${label}"] for "${projectId}" in ${source} must be a non-empty string.`
      )
    }
    if (knownAgentNames.size > 0 && !knownAgentNames.has(agentName.trim())) {
      throw new Error(
        `project.agentLabels["${label}"] for "${projectId}" in ${source} references unknown agent "${agentName}".`
      )
    }
    result[label] = agentName.trim()
  }
  return result
}

function parseProject(
  raw: unknown,
  source: string,
  agents: AgentDefinition[]
): ProjectConfig {
  assertObject(raw, `project entry in ${source}`)

  const id = assertNonEmptyString(raw.id, `project.id in ${source}`)
  const workspaceDir = assertNonEmptyString(raw.workspaceDir, `project.workspaceDir in ${source}`)
  if (!path.isAbsolute(workspaceDir)) {
    throw new Error(`project.workspaceDir for "${id}" in ${source} must be an absolute path.`)
  }

  const pullFrom = raw.pullFrom
  assertObject(pullFrom, `project.pullFrom for "${id}" in ${source}`)
  const provider = assertNonEmptyString(
    pullFrom.provider,
    `project.pullFrom.provider for "${id}" in ${source}`
  )
  if (!ALLOWED_PULL_PROVIDERS.includes(provider as ProjectConfig['pullFrom']['provider'])) {
    throw new Error(`Unsupported pull provider "${provider}" for project "${id}" in ${source}.`)
  }

  const pullFromFilters = pullFrom.filters
  assertObject(pullFromFilters, `project.pullFrom.filters for "${id}" in ${source}`)
  const filters = pullFromFilters as ProjectConfig['pullFrom']['filters']
  if (provider === PULL_PROVIDER.GITHUB) {
    assertNonEmptyString(filters.owner, `project.pullFrom.filters.owner for "${id}" in ${source}`)
    assertNonEmptyString(filters.repo, `project.pullFrom.filters.repo for "${id}" in ${source}`)
  }

  const agentRaw = raw.agent
  assertObject(agentRaw, `project.agent for "${id}" in ${source}`)
  assertNoUnknownKeys(
    agentRaw,
    ['provider', 'model', 'name'],
    `project.agent for "${id}" in ${source}`
  )

  const agentName = assertOptionalString(agentRaw.name, `project.agent.name for "${id}" in ${source}`)
  const knownAgentNames = new Set(agents.map((a) => a.name))

  let agentProvider: ProjectConfig['agent']['provider']
  let agentModel: string | undefined
  let agentSystemPrompt: string | undefined

  if (agentName) {
    const namedAgent = agents.find((a) => a.name === agentName)
    if (!namedAgent) {
      throw new Error(
        `project.agent.name "${agentName}" for "${id}" in ${source} references an unknown agent.`
      )
    }
    agentProvider = namedAgent.provider
    agentModel =
      assertOptionalString(agentRaw.model, `project.agent.model for "${id}" in ${source}`) ??
      namedAgent.model
    agentSystemPrompt = namedAgent.systemPrompt
  } else {
    const agentProviderRaw = assertNonEmptyString(
      agentRaw.provider,
      `project.agent.provider for "${id}" in ${source} (required when agent.name is not set)`
    )
    if (
      !ALLOWED_AGENT_PROVIDERS.includes(
        agentProviderRaw as (typeof ALLOWED_AGENT_PROVIDERS)[number]
      )
    ) {
      throw new Error(
        `Unsupported agent provider "${agentProviderRaw}" for project "${id}" in ${source}. Supported: ${ALLOWED_AGENT_PROVIDERS.join(', ')}.`
      )
    }
    agentProvider = agentProviderRaw as ProjectConfig['agent']['provider']
    agentModel = assertOptionalString(agentRaw.model, `project.agent.model for "${id}" in ${source}`)
  }

  const agentLabels = parseAgentLabels(raw.agentLabels, id, source, knownAgentNames)

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
    agentLabels: Object.keys(agentLabels).length > 0 ? agentLabels : undefined,
  }
}

async function assertWorkspaceExists(project: ProjectConfig, source: string): Promise<void> {
  const stat = await fs.stat(project.workspaceDir).catch(() => null)

  if (!stat || !stat.isDirectory()) {
    throw new Error(
      `project.workspaceDir for "${project.id}" in ${source} does not exist or is not a directory: ${project.workspaceDir}`
    )
  }
}

async function validateConfig(
  raw: unknown,
  source: string,
  envFilePath?: string
): Promise<AppConfig> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`config ${source} must define a non-empty array.`)
  }

  // Partition items by type: agents, slack, projects
  let agents: AgentDefinition[] = []
  let slack: SlackConfig | undefined
  const projectRaws: unknown[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`config ${source} contains an invalid entry.`)
    }

    const record = item as Record<string, unknown>
    if ('agents' in record) {
      agents = parseAgentDefinitions(record.agents, source)
    } else if ('slack' in record) {
      slack = parseSlackConfig(record.slack, source)
    } else if ('id' in record) {
      projectRaws.push(record)
    } else {
      throw new Error(
        `config ${source} contains an unrecognized entry. Expected "agents:", "slack:", or a project entry with "id:".`
      )
    }
  }

  const projects: ProjectConfig[] = []
  const uniqueIds = new Set<string>()
  for (const projectRaw of projectRaws) {
    const parsed = parseProject(projectRaw, source, agents)
    const project = { ...parsed, envFilePath }
    if (uniqueIds.has(project.id)) {
      throw new Error(`Duplicate project id "${project.id}" in ${source}.`)
    }
    uniqueIds.add(project.id)
    await assertWorkspaceExists(project, source)
    projects.push(project)
  }

  return {
    concurrency: parseRuntimeConcurrency(),
    logs: ['info', 'success', 'warn', 'error'],
    server: parseRuntimeServerConfig(),
    projects,
    agents,
    slack,
  }
}

function mergeConfigs(configs: AppConfig[]): AppConfig {
  const merged = buildEmptyConfig()
  const projectIds = new Set<string>()
  const agentNames = new Set<string>()

  for (const config of configs) {
    for (const agent of config.agents) {
      if (agentNames.has(agent.name)) {
        throw new Error(`Duplicate agent name "${agent.name}" across registered configs.`)
      }
      agentNames.add(agent.name)
      merged.agents.push(agent)
    }

    if (config.slack) {
      if (merged.slack) {
        throw new Error('Duplicate slack configuration across registered configs.')
      }
      merged.slack = config.slack
    }

    for (const project of config.projects) {
      if (projectIds.has(project.id)) {
        throw new Error(`Duplicate project id "${project.id}" across registered configs.`)
      }
      projectIds.add(project.id)
      merged.projects.push(project)
    }
  }

  return merged
}
