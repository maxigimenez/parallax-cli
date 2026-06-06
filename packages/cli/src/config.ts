import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type { StoredConfig } from '@parallax/common'
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
    ('networkAccess' in parsed &&
      typeof (parsed as { networkAccess?: unknown }).networkAccess !== 'boolean') ||
    ('uiPid' in parsed && typeof (parsed as { uiPid?: unknown }).uiPid !== 'number') ||
    (typeof (parsed as { uiPid?: unknown }).uiPid === 'number' &&
      (parsed as { uiPid: number }).uiPid <= 0)
  ) {
    throw new Error(`Invalid running manifest at ${source}.`)
  }

  return {
    ...(parsed as RunningState),
    networkAccess: (parsed as { networkAccess?: boolean }).networkAccess === true,
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
  return {
    version: typeof obj.version === 'number' ? obj.version : 1,
    projects: Array.isArray(obj.projects) ? (obj.projects as StoredConfig['projects']) : [],
    slack:
      obj.slack && typeof obj.slack === 'object' && !Array.isArray(obj.slack)
        ? (obj.slack as StoredConfig['slack'])
        : null,
    secrets:
      obj.secrets && typeof obj.secrets === 'object' && !Array.isArray(obj.secrets)
        ? (obj.secrets as Record<string, string>)
        : {},
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  }
}

export async function loadStoredConfig(dataDir: string): Promise<StoredConfig> {
  const configPath = path.join(dataDir, CONFIG_FILE)
  if (!(await ensureFileExists(configPath))) {
    return {
      version: 1,
      projects: [],
      slack: null,
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
