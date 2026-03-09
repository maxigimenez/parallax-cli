import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { DEFAULT_API_PORT, DEFAULT_UI_PORT, type ServerConfig } from '@parallax/common'
import type { RunningState } from './types.js'

const requireFromCli = createRequire(import.meta.url)

function loadYamlModule() {
  try {
    return requireFromCli('js-yaml') as { load: (input: string) => unknown }
  } catch (error) {
    throw new Error(
      'Missing runtime dependency "js-yaml". Reinstall parallax-ai (npm i -g parallax-ai@alpha).',
      { cause: error }
    )
  }
}

function ensureArray(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid array value in ${source}.`)
  }

  return value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`Invalid item in array value from ${source}.`)
    }

    return entry.trim()
  })
}

export function findWorkspaceRoot(startDir: string): string {
  let current = startDir
  while (current !== path.parse(current).root) {
    const packageJsonPath = path.join(current, 'package.json')
    if (fsSync.existsSync(packageJsonPath)) {
      const content = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf8'))
      if (content.name === 'parallax') {
        return current
      }
    }
    current = path.dirname(current)
  }

  throw new Error(`Unable to resolve workspace root from ${startDir}.`)
}

export async function ensureFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function parseRunningState(raw: string, source: string): RunningState {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid running manifest at ${source}: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error }
    )
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { startedAt?: unknown }).startedAt !== 'number' ||
    typeof (parsed as { configPath?: unknown }).configPath !== 'string' ||
    typeof (parsed as { dataDir?: unknown }).dataDir !== 'string' ||
    typeof (parsed as { orchestratorPid?: unknown }).orchestratorPid !== 'number' ||
    (parsed as { orchestratorPid: number }).orchestratorPid <= 0 ||
    ('uiPid' in parsed && typeof (parsed as { uiPid?: unknown }).uiPid !== 'number') ||
    (typeof (parsed as { uiPid?: unknown }).uiPid === 'number' &&
      (parsed as { uiPid: number }).uiPid <= 0)
  ) {
    throw new Error(`Invalid running manifest at ${source}.`)
  }

  return parsed as RunningState
}

export function parseConfigProjectIds(raw: string, source: string): Set<string> {
  const parsed = (loadYamlModule().load(raw) as { projects?: unknown }) || {}
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { projects?: unknown }).projects)
  ) {
    throw new Error(`Invalid parallax config at ${source}.`)
  }

  const projects = ensureArray(
    (parsed as { projects: unknown[] }).projects.map((project) =>
      typeof project === 'object' && project && 'id' in project
        ? (project as { id?: unknown }).id
        : undefined
    ),
    `projects section in ${source}`
  )

  if (projects.length === 0) {
    throw new Error(`Config ${source} has no projects.`)
  }

  return new Set(projects)
}

export function parseServerPortsFromConfig(raw: string, source: string): ServerConfig {
  const parsed = (loadYamlModule().load(raw) as { server?: unknown }) || {}
  const server = parsed.server

  if (server === undefined) {
    return {
      apiPort: DEFAULT_API_PORT,
      uiPort: DEFAULT_UI_PORT,
    }
  }

  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    throw new Error(`Invalid server config at ${source}.`)
  }

  const parsePort = (value: unknown, label: string, fallback: number) => {
    if (value === undefined) {
      return fallback
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${label} in ${source} must be an integer between 1 and 65535.`)
    }

    return value
  }

  const resolved = {
    apiPort: parsePort((server as { apiPort?: unknown }).apiPort, 'server.apiPort', DEFAULT_API_PORT),
    uiPort: parsePort((server as { uiPort?: unknown }).uiPort, 'server.uiPort', DEFAULT_UI_PORT),
  }

  if (resolved.apiPort === resolved.uiPort) {
    throw new Error(`server.apiPort and server.uiPort in ${source} must be different.`)
  }

  return resolved
}

export async function resolveServerPorts(configPath: string): Promise<ServerConfig> {
  return parseServerPortsFromConfig(await fs.readFile(configPath, 'utf8'), configPath)
}

export async function loadRunningState(dataDir: string, manifestFile: string): Promise<RunningState> {
  const manifestPath = path.join(dataDir, manifestFile)
  if (!(await ensureFileExists(manifestPath))) {
    throw new Error(`No running instance found at ${manifestPath}. Run parallax start first.`)
  }

  return parseRunningState(await fs.readFile(manifestPath, 'utf8'), manifestPath)
}

export async function resolveProjectIdsFromRunningConfig(
  dataDir: string,
  manifestFile: string
): Promise<Set<string>> {
  const manifest = await loadRunningState(dataDir, manifestFile)
  if (!(await ensureFileExists(manifest.configPath))) {
    throw new Error(`Running config file not found: ${manifest.configPath}`)
  }

  return parseConfigProjectIds(await fs.readFile(manifest.configPath, 'utf8'), manifest.configPath)
}

export async function resolveProjectIdsForPending(
  dataDir: string,
  manifestFile: string,
  configPath?: string
): Promise<Set<string>> {
  if (configPath) {
    if (!(await ensureFileExists(configPath))) {
      throw new Error(`Config file not found: ${configPath}`)
    }

    return parseConfigProjectIds(await fs.readFile(configPath, 'utf8'), configPath)
  }

  return resolveProjectIdsFromRunningConfig(dataDir, manifestFile)
}

export async function validateConfigFile(configPath: string): Promise<void> {
  const raw = await fs.readFile(configPath, 'utf8')
  const parsed = (loadYamlModule().load(raw) || {}) as { projects?: unknown }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
    throw new Error(`Invalid parallax config at ${configPath}`)
  }
}

export async function resolveEnvFilePath(
  explicitValue: string | undefined,
  resolvePath: (value: string) => string,
  ensureExists: (filePath: string) => Promise<boolean>
): Promise<string | undefined> {
  if (!explicitValue) {
    return undefined
  }

  const resolved = resolvePath(explicitValue)
  if (!(await ensureExists(resolved))) {
    throw new Error(`Env file not found: ${resolved}`)
  }

  return resolved
}
