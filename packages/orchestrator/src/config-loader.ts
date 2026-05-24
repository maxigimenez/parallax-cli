import path from 'node:path'
import os from 'node:os'
import { AppConfig, DEFAULT_API_PORT, DEFAULT_UI_PORT, ServerConfig } from '@parallax/common'
import { readConfigStore } from './config-store.js'
import { validateStoredConfig } from './config-validation.js'

export function resolveDataDir(): string {
  return process.env.PARALLAX_DATA_DIR
    ? path.resolve(process.env.PARALLAX_DATA_DIR)
    : path.join(os.homedir(), '.parallax')
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

export async function loadConfig(): Promise<AppConfig> {
  const dataDir = resolveDataDir()
  const stored = await readConfigStore(dataDir)

  for (const [key, value] of Object.entries(stored.secrets)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  const { projects, slack } = validateStoredConfig(stored)

  return {
    concurrency: parseRuntimeConcurrency(),
    logs: ['info', 'success', 'warn', 'error'],
    server: parseRuntimeServerConfig(),
    projects,
    slack,
  }
}
