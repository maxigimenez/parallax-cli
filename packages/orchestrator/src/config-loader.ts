import fs from 'fs/promises'
import yaml from 'js-yaml'
import path from 'path'
import {
  AppConfig,
  DEFAULT_API_PORT,
  DEFAULT_UI_PORT,
  LogLevel,
  ProjectConfig,
  ServerConfig,
} from '@parallax/common'

const DEFAULT_CONFIG_NAMES = ['parallax.yml', '.parallax/config.yml', '.parallax/config.yaml']

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveConfigPath(): Promise<string> {
  if (process.env.PARALLAX_CONFIG_PATH) {
    return path.resolve(process.cwd(), process.env.PARALLAX_CONFIG_PATH)
  }

  const workspaceRootCandidates = [process.cwd(), path.resolve(process.cwd(), '..', '..')]

  for (const base of workspaceRootCandidates) {
    const configuredPath = path.resolve(base, 'parallax.yml')
    if (await fileExists(configuredPath)) {
      return configuredPath
    }
  }

  for (const name of DEFAULT_CONFIG_NAMES) {
    const candidate = path.resolve(process.cwd(), name)
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  return path.resolve(process.cwd(), '../../parallax.yml')
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = await resolveConfigPath()
  const fileContent = await fs.readFile(configPath, 'utf8')
  const parsed = (yaml.load(fileContent) || {}) as Partial<AppConfig>
  return validateConfig(parsed, configPath)
}

const ALLOWED_LOG_LEVELS: LogLevel[] = ['info', 'success', 'warn', 'error']
const ALLOWED_AGENT_PROVIDERS = ['codex', 'gemini'] as const

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

function parseConcurrency(raw: unknown, source: string): number {
  if (raw === undefined) {
    return 1
  }

  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 16) {
    throw new Error(`concurrency in ${source} must be an integer between 1 and 16.`)
  }

  return raw
}

function parsePort(raw: unknown, label: string, fallback: number): number {
  if (raw === undefined) {
    return fallback
  }

  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`)
  }

  return raw
}

function parseServerConfig(raw: unknown, source: string): ServerConfig {
  if (raw === undefined) {
    return {
      apiPort: DEFAULT_API_PORT,
      uiPort: DEFAULT_UI_PORT,
    }
  }

  assertObject(raw, `server in ${source}`)

  const server = raw as Record<string, unknown>
  const apiPort = parsePort(server.apiPort, `server.apiPort in ${source}`, DEFAULT_API_PORT)
  const uiPort = parsePort(server.uiPort, `server.uiPort in ${source}`, DEFAULT_UI_PORT)

  if (apiPort === uiPort) {
    throw new Error(`server.apiPort and server.uiPort in ${source} must be different.`)
  }

  return { apiPort, uiPort }
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
  if (provider !== 'linear' && provider !== 'github') {
    throw new Error(`Unsupported pull provider "${provider}" for project "${id}" in ${source}.`)
  }

  const pullFromFilters = pullFrom.filters
  assertObject(pullFromFilters, `project.pullFrom.filters for "${id}" in ${source}`)
  const filters = pullFromFilters as ProjectConfig['pullFrom']['filters']
  if (provider === 'github') {
    assertNonEmptyString(filters.owner, `project.pullFrom.filters.owner for "${id}" in ${source}`)
    assertNonEmptyString(filters.repo, `project.pullFrom.filters.repo for "${id}" in ${source}`)
  }

  const agent = raw.agent
  assertObject(agent, `project.agent for "${id}" in ${source}`)
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

  const approvalModeRaw = agent.approvalMode
  if (
    approvalModeRaw !== undefined &&
    approvalModeRaw !== 'default' &&
    approvalModeRaw !== 'auto_edit'
  ) {
    throw new Error(
      `project.agent.approvalMode for "${id}" in ${source} must be "default" or "auto_edit".`
    )
  }

  const sandboxRaw = agent.sandbox
  if (sandboxRaw !== undefined && typeof sandboxRaw !== 'boolean') {
    throw new Error(`project.agent.sandbox for "${id}" in ${source} must be boolean.`)
  }

  const disableMcpRaw = agent.disableMcp
  if (disableMcpRaw !== undefined && typeof disableMcpRaw !== 'boolean') {
    throw new Error(`project.agent.disableMcp for "${id}" in ${source} must be boolean.`)
  }

  const allowedToolsRaw = agent.allowedTools
  if (allowedToolsRaw !== undefined && !Array.isArray(allowedToolsRaw)) {
    throw new Error(`project.agent.allowedTools for "${id}" in ${source} must be an array.`)
  }
  const allowedTools = Array.isArray(allowedToolsRaw)
    ? allowedToolsRaw.map((tool) =>
        assertNonEmptyString(tool, `project.agent.allowedTools[] for "${id}" in ${source}`)
      )
    : undefined

  const extraArgsRaw = agent.extraArgs
  if (extraArgsRaw !== undefined && !Array.isArray(extraArgsRaw)) {
    throw new Error(`project.agent.extraArgs for "${id}" in ${source} must be an array.`)
  }
  const extraArgs = Array.isArray(extraArgsRaw)
    ? extraArgsRaw.map((arg) =>
        assertNonEmptyString(arg, `project.agent.extraArgs[] for "${id}" in ${source}`)
      )
    : undefined

  return {
    id,
    workspaceDir,
    pullFrom: {
      provider,
      filters,
    },
    agent: {
      provider: agentProvider,
      model: assertOptionalString(agent.model, `project.agent.model for "${id}" in ${source}`),
      approvalMode: approvalModeRaw as ProjectConfig['agent']['approvalMode'],
      sandbox: sandboxRaw as boolean | undefined,
      disableMcp: disableMcpRaw as boolean | undefined,
      allowedTools,
      extraArgs,
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

async function validateConfig(raw: Partial<AppConfig>, source: string): Promise<AppConfig> {
  assertObject(raw, `config ${source}`)
  if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
    throw new Error(`config ${source} must define at least one project.`)
  }

  const projects = raw.projects.map((project) => parseProject(project, source))
  const uniqueIds = new Set<string>()
  for (const project of projects) {
    if (uniqueIds.has(project.id)) {
      throw new Error(`Duplicate project id "${project.id}" in ${source}.`)
    }
    uniqueIds.add(project.id)
    await assertWorkspaceExists(project, source)
  }

  return {
    concurrency: parseConcurrency(raw.concurrency, source),
    logs: parseLogs(raw.logs, source),
    server: parseServerConfig(raw.server, source),
    projects,
  }
}
