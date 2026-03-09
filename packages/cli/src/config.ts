import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { ServerConfig } from '@parallax/common'
import type { RegistryState, RunningState } from './types.js'

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
    typeof (parsed as { orchestratorPid?: unknown }).orchestratorPid !== 'number' ||
    typeof (parsed as { apiPort?: unknown }).apiPort !== 'number' ||
    typeof (parsed as { uiPort?: unknown }).uiPort !== 'number' ||
    (parsed as { orchestratorPid: number }).orchestratorPid <= 0 ||
    (parsed as { apiPort: number }).apiPort <= 0 ||
    (parsed as { uiPort: number }).uiPort <= 0 ||
    ('uiPid' in parsed && typeof (parsed as { uiPid?: unknown }).uiPid !== 'number') ||
    (typeof (parsed as { uiPid?: unknown }).uiPid === 'number' &&
      (parsed as { uiPid: number }).uiPid <= 0)
  ) {
    throw new Error(`Invalid running manifest at ${source}.`)
  }

  return parsed as RunningState
}

export function parseRegistryState(raw: string, source: string): RegistryState {
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

export function parseConfigProjectIds(raw: string, source: string): Set<string> {
  const parsed = loadYamlModule().load(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid parallax config at ${source}.`)
  }

  const projects = ensureArray(
    parsed.map((project) =>
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
  throw new Error(`Server ports are no longer configured in ${source}; use "parallax start" flags.`)
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

export async function loadRegistry(dataDir: string, registryFile: string): Promise<RegistryState> {
  const registryPath = path.join(dataDir, registryFile)
  if (!(await ensureFileExists(registryPath))) {
    return { configs: [] }
  }

  return parseRegistryState(await fs.readFile(registryPath, 'utf8'), registryPath)
}

export async function saveRegistry(
  dataDir: string,
  registryFile: string,
  registry: RegistryState
): Promise<void> {
  await fs.writeFile(path.join(dataDir, registryFile), JSON.stringify(registry, null, 2))
}

export async function resolveProjectIdsFromRegistry(
  dataDir: string,
  registryFile: string
): Promise<Set<string>> {
  const registry = await loadRegistry(dataDir, registryFile)
  const ids = new Set<string>()

  for (const config of registry.configs) {
    if (!(await ensureFileExists(config.configPath))) {
      throw new Error(`Registered config file not found: ${config.configPath}`)
    }

    const configIds = parseConfigProjectIds(
      await fs.readFile(config.configPath, 'utf8'),
      config.configPath
    )

    for (const id of configIds) {
      if (ids.has(id)) {
        throw new Error(`Duplicate project id "${id}" across registered configs.`)
      }
      ids.add(id)
    }
  }

  return ids
}

export async function validateConfigFile(configPath: string): Promise<void> {
  const raw = await fs.readFile(configPath, 'utf8')
  const parsed = loadYamlModule().load(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) {
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
