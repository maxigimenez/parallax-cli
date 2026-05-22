import fs from 'node:fs/promises'
import path from 'node:path'
import type { StoredConfig } from '@parallax/common'

const CONFIG_FILE = 'config.json'

export function emptyStoredConfig(): StoredConfig {
  return {
    version: 1,
    projects: [],
    agents: [],
    slack: null,
    secrets: {},
    updatedAt: 0,
  }
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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config at ${configPath}: must be an object.`)
  }

  const obj = parsed as Record<string, unknown>

  return {
    version: typeof obj.version === 'number' ? obj.version : 1,
    projects: Array.isArray(obj.projects) ? (obj.projects as StoredConfig['projects']) : [],
    agents: Array.isArray(obj.agents) ? (obj.agents as StoredConfig['agents']) : [],
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

export async function writeConfigStore(dataDir: string, config: StoredConfig): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  const configPath = path.join(dataDir, CONFIG_FILE)
  const tmpPath = `${configPath}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify({ ...config, updatedAt: Date.now() }, null, 2))
  await fs.rename(tmpPath, configPath)
}
