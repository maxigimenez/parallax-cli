import path from 'node:path'
import os from 'node:os'
import {
  DEFAULT_API_PORT,
  DEFAULT_CONCURRENCY,
  type AppConfig,
  type ServerConfig,
} from '@sentinel0/common'
import { readConfigStore } from './config-store.js'
import { validateStoredConfig } from './config-validation.js'

export function resolveDataDir(): string {
  return process.env.SENTINEL0_DATA_DIR
    ? path.resolve(process.env.SENTINEL0_DATA_DIR)
    : path.join(os.homedir(), '.sentinel0')
}

function parseRuntimeConcurrency(): number {
  const raw = process.env.SENTINEL0_CONCURRENCY
  if (raw === undefined) {
    return DEFAULT_CONCURRENCY
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) {
    throw new Error('SENTINEL0_CONCURRENCY must be an integer between 1 and 16.')
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
    process.env.SENTINEL0_SERVER_API_PORT,
    'SENTINEL0_SERVER_API_PORT',
    DEFAULT_API_PORT
  )

  const rawNetworkAccess = process.env.SENTINEL0_NETWORK_ACCESS
  if (
    rawNetworkAccess !== undefined &&
    rawNetworkAccess !== 'true' &&
    rawNetworkAccess !== 'false'
  ) {
    throw new Error('SENTINEL0_NETWORK_ACCESS must be "true" or "false".')
  }

  return { apiPort, networkAccess: rawNetworkAccess === 'true' }
}

export async function loadConfig(): Promise<AppConfig> {
  const dataDir = resolveDataDir()
  const stored = await readConfigStore(dataDir)

  // Secrets reach `gh` and any other subprocess through inherited env. Existing
  // env always wins so an operator can override one without editing config.
  for (const [key, value] of Object.entries(stored.secrets)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  const { projects, hermes, cloud } = validateStoredConfig(stored)

  return {
    concurrency: parseRuntimeConcurrency(),
    logs: ['info', 'success', 'warn', 'error'],
    server: parseRuntimeServerConfig(),
    projects,
    hermes,
    cloud,
  }
}
