import fs from 'node:fs/promises'
import path from 'node:path'
import { CONFIG_VERSION, type StoredConfig } from '@sentinel0/common'

const CONFIG_FILE = 'config.json'

export function emptyStoredConfig(): StoredConfig {
  return {
    version: CONFIG_VERSION,
    cloud: null,
    hermes: null,
    projects: [],
    secrets: {},
    updatedAt: 0,
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function readConfigStore(dataDir: string): Promise<StoredConfig> {
  const configPath = path.join(dataDir, CONFIG_FILE)
  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf8')
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return emptyStoredConfig()
    }
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid config at ${configPath}: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error }
    )
  }

  const obj = record(parsed)
  if (!obj) {
    throw new Error(`Invalid config at ${configPath}: must be an object.`)
  }

  const version = typeof obj.version === 'number' ? obj.version : 1

  // Sentinel0 v1 configured one CLI agent per project against a local clone.
  // None of that maps onto Hermes profiles and routing rules, so rather than
  // guess at a migration we say plainly what to re-run.
  if (version < CONFIG_VERSION) {
    throw new Error(
      `Config at ${configPath} is version ${version}; this build requires version ${CONFIG_VERSION}. ` +
        `The v1 format (per-project CLI agents and local clones) has no equivalent here. ` +
        `Move it aside and run "sentinel0 init" to reconfigure against Hermes.`
    )
  }
  if (version > CONFIG_VERSION) {
    throw new Error(
      `Config at ${configPath} is version ${version}, newer than this build supports (${CONFIG_VERSION}). Upgrade sentinel0.`
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

export async function writeConfigStore(dataDir: string, config: StoredConfig): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  const configPath = path.join(dataDir, CONFIG_FILE)
  const tmpPath = `${configPath}.tmp`
  await fs.writeFile(
    tmpPath,
    JSON.stringify({ ...config, version: CONFIG_VERSION, updatedAt: Date.now() }, null, 2)
  )
  await fs.rename(tmpPath, configPath)
}
