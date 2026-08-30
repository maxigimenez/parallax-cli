import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { CONFIG_VERSION, type StoredConfig } from '@parallax/common'
import type { RunningState } from './types.js'

export function resolveCliRoot(startDir: string): string {
  let current = startDir
  let cliPackageRoot: string | undefined
  while (current !== path.parse(current).root) {
    const packageJsonPath = path.join(current, 'package.json')
    if (fsSync.existsSync(packageJsonPath)) {
      const content = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf8'))
      if (content.name === 'parallax') {
        return current
      }
      if (content.name === 'parallax-cli') {
        cliPackageRoot = current
      }
    }
    current = path.dirname(current)
  }

  if (cliPackageRoot) {
    return cliPackageRoot
  }

  throw new Error(`Unable to resolve CLI root from ${startDir}.`)
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

  const state = parsed as Partial<RunningState> | null
  const valid =
    state &&
    typeof state === 'object' &&
    typeof state.startedAt === 'number' &&
    typeof state.runnerPid === 'number' &&
    state.runnerPid > 0 &&
    typeof state.apiPort === 'number' &&
    state.apiPort > 0 &&
    (state.networkAccess === undefined || typeof state.networkAccess === 'boolean')

  if (!valid) {
    throw new Error(`Invalid running manifest at ${source}.`)
  }

  return {
    startedAt: state.startedAt as number,
    runnerPid: state.runnerPid as number,
    apiPort: state.apiPort as number,
    networkAccess: state.networkAccess === true,
  }
}

export async function loadRunningState(
  dataDir: string,
  manifestFile: string
): Promise<RunningState> {
  const manifestPath = path.join(dataDir, manifestFile)
  if (!(await ensureFileExists(manifestPath))) {
    throw new Error(`No running instance found at ${manifestPath}. Run parallax start first.`)
  }

  return parseRunningState(await fs.readFile(manifestPath, 'utf8'), manifestPath)
}

const CONFIG_FILE = 'config.json'

function parseStoredConfigFromDisk(raw: string, source: string): StoredConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid config at ${source}: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error }
    )
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config at ${source}: must be an object.`)
  }

  const obj = parsed as Record<string, unknown>
  const record = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null

  const version = typeof obj.version === 'number' ? obj.version : 1
  if (version !== CONFIG_VERSION) {
    throw new Error(
      `Config at ${source} is version ${version}; this CLI requires version ${CONFIG_VERSION}. ` +
        `Move it aside and run "parallax init".`
    )
  }

  return {
    version,
    cloud: record(obj.cloud) as StoredConfig['cloud'],
    hermes: record(obj.hermes) as StoredConfig['hermes'],
    projects: Array.isArray(obj.projects) ? (obj.projects as StoredConfig['projects']) : [],
    secrets: (record(obj.secrets) as Record<string, string>) ?? {},
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  }
}

export async function loadStoredConfig(dataDir: string): Promise<StoredConfig> {
  const configPath = path.join(dataDir, CONFIG_FILE)
  if (!(await ensureFileExists(configPath))) {
    return {
      version: CONFIG_VERSION,
      cloud: null,
      hermes: null,
      projects: [],
      secrets: {},
      updatedAt: 0,
    }
  }

  return parseStoredConfigFromDisk(await fs.readFile(configPath, 'utf8'), configPath)
}

export async function saveStoredConfig(dataDir: string, config: StoredConfig): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  const configPath = path.join(dataDir, CONFIG_FILE)
  const tmpPath = `${configPath}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify({ ...config, updatedAt: Date.now() }, null, 2))
  await fs.rename(tmpPath, configPath)
}
