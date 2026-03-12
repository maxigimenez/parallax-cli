import fs from 'fs/promises'
import yaml from 'js-yaml'
import path from 'path'
import os from 'os'
import dotenv from 'dotenv'
import {
  AGENT_PROVIDER,
  AppConfig,
  DEFAULT_API_PORT,
  DEFAULT_UI_PORT,
  LOG_LEVEL,
  LogLevel,
  PULL_PROVIDER,
  ProjectConfig,
  ServerConfig,
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

function assertNoUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  label: string
) {
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

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { configs?: unknown }).configs)) {
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
        envFilePath:
          (entry as { envFilePath?: string }).envFilePath?.trim() || undefined,
      }
    }),
  }
}

function parseProject(raw: unknown, source: string): ProjectConfig {
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

  const agent = raw.agent
  assertObject(agent, `project.agent for "${id}" in ${source}`)
  assertNoUnknownKeys(agent, ['provider', 'model'], `project.agent for "${id}" in ${source}`)
  const agentProviderRaw = assertNonEmptyString(
    agent.provider,
    `project.agent.provider for "${id}" in ${source}`
  )
  if (
    !ALLOWED_AGENT_PROVIDERS.includes(
      agentProviderRaw as (typeof ALLOWED_AGENT_PROVIDERS)[number]
    )
  ) {
    throw new Error(
      `Unsupported agent provider "${agentProviderRaw}" for project "${id}" in ${source}. Supported providers: ${ALLOWED_AGENT_PROVIDERS.join(', ')}.`
    )
  }
  const agentProvider = agentProviderRaw as ProjectConfig['agent']['provider']

  return {
    id,
    workspaceDir,
    pullFrom: {
      provider: provider as ProjectConfig['pullFrom']['provider'],
      filters,
    },
    agent: {
      provider: agentProvider,
      model: assertOptionalString(agent.model, `project.agent.model for "${id}" in ${source}`),
    },
  }
}

async function assertWorkspaceExists(project: ProjectConfig, source: string): Promise<void> {
  const stat = await fs
    .stat(project.workspaceDir)
    .catch(() => null)

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
    throw new Error(`config ${source} must define a non-empty project array.`)
  }

  const projects = raw.map((project) => {
    const parsed = parseProject(project, source)
    return {
      ...parsed,
      envFilePath,
    }
  })
  const uniqueIds = new Set<string>()
  for (const project of projects) {
    if (uniqueIds.has(project.id)) {
      throw new Error(`Duplicate project id "${project.id}" in ${source}.`)
    }
    uniqueIds.add(project.id)
    await assertWorkspaceExists(project, source)
  }

  return {
    concurrency: parseRuntimeConcurrency(),
    logs: ['info', 'success', 'warn', 'error'],
    server: parseRuntimeServerConfig(),
    projects,
  }
}

function mergeConfigs(configs: AppConfig[]): AppConfig {
  const merged = buildEmptyConfig()
  const projectIds = new Set<string>()

  for (const config of configs) {
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
