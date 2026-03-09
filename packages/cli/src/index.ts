#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_API_PORT } from '@parallax/common'
import { hasFlag, parseCancelOptions, parseLogsOptions, parsePendingOptions, parsePreflightOptions, parseRetryOptions, parseStopOptions as parseStopOptionsInternal, resolvePath } from './args.js'
import {
  ensureFileExists,
  findWorkspaceRoot,
  loadRunningState as loadRunningStateFromDisk,
  parseConfigProjectIds,
  parseRunningState,
  parseServerPortsFromConfig,
  resolveProjectIdsForPending as resolvePendingProjectIds,
  resolveServerPorts,
} from './config.js'
import { runCancel } from './commands/cancel.js'
import { runLogs } from './commands/logs.js'
import {
  resolveApproveTargets,
  resolveRejectTarget,
  runPending,
  scopePendingTasks,
} from './commands/pending.js'
import { runPreflight } from './commands/preflight.js'
import { runRetry } from './commands/retry.js'
import { runStart } from './commands/start.js'
import { runStop } from './commands/stop.js'
import type { CliContext } from './types.js'
import { printUsage } from './usage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_DATA_DIR = path.join(process.cwd(), '.parallax')
const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'parallax.yml')
const DEFAULT_API_BASE = `http://localhost:${DEFAULT_API_PORT}`
const MANIFEST_FILE = 'running.json'
const CLI_VERSION = '0.0.1'
const ROOT_DIR = findWorkspaceRoot(__dirname)

async function resolveDefaultApiBase(dataDir?: string, configPath?: string): Promise<string> {
  if (configPath && (await ensureFileExists(configPath))) {
    const server = await resolveServerPorts(configPath)
    return `http://localhost:${server.apiPort}`
  }

  if (!dataDir) {
    throw new Error('API base is required when no running data directory is available.')
  }

  const manifest = await loadRunningStateFromDisk(dataDir, MANIFEST_FILE)
  if (!(await ensureFileExists(manifest.configPath))) {
    throw new Error(`Running config file not found: ${manifest.configPath}`)
  }

  const server = await resolveServerPorts(manifest.configPath)
  return `http://localhost:${server.apiPort}`
}

function buildEnvConfig(configPath: string | undefined, dataDir: string) {
  const env: Record<string, string> = {
    PARALLAX_DATA_DIR: dataDir,
    PARALLAX_DB_PATH: path.join(dataDir, 'parallax.db'),
  }

  if (configPath) {
    env.PARALLAX_CONFIG_PATH = configPath
  }

  return env
}

const cliContext: CliContext = {
  defaultApiBase: DEFAULT_API_BASE,
  defaultConfigPath: DEFAULT_CONFIG_PATH,
  defaultDataDir: DEFAULT_DATA_DIR,
  manifestFile: MANIFEST_FILE,
  rootDir: ROOT_DIR,
  cliVersion: CLI_VERSION,
  resolvePath,
  ensureFileExists,
  loadRunningState: (dataDir) => loadRunningStateFromDisk(dataDir, MANIFEST_FILE),
  resolveProjectIdsForPending: (dataDir, configPath) =>
    resolvePendingProjectIds(dataDir, MANIFEST_FILE, configPath),
  resolveDefaultApiBase,
  resolveServerPorts,
  buildEnvConfig,
}

async function cli() {
  const args = process.argv.slice(2)

  if (args.length === 0 || hasFlag(args, 'help') || hasFlag(args, 'h')) {
    printUsage()
    return
  }

  if (hasFlag(args, 'version') || hasFlag(args, 'v')) {
    console.log(CLI_VERSION)
    return
  }

  const command = args[0]
  const commandArgs = args.slice(1)

  try {
    switch (command) {
      case 'start':
        await runStart(commandArgs, cliContext)
        return
      case 'pending':
        await runPending(commandArgs, cliContext)
        return
      case 'preflight':
        await runPreflight(commandArgs)
        return
      case 'stop':
        await runStop(commandArgs, cliContext)
        return
      case 'retry':
        await runRetry(commandArgs, cliContext)
        return
      case 'cancel':
        await runCancel(commandArgs, cliContext)
        return
      case 'logs':
        await runLogs(commandArgs, cliContext)
        return
      default:
        printUsage()
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

export {
  parseCancelOptions,
  parseConfigProjectIds,
  parseLogsOptions,
  parsePendingOptions,
  parsePreflightOptions,
  parseRetryOptions,
  parseRunningState,
  parseServerPortsFromConfig,
  resolveApproveTargets,
  resolveRejectTarget,
  resolveDefaultApiBase,
  resolvePath,
  scopePendingTasks,
}

export async function resolveProjectIdsForPending(dataDir: string, configPath?: string) {
  return resolvePendingProjectIds(dataDir, MANIFEST_FILE, configPath)
}

export function parseStopOptions(args: string[]) {
  return parseStopOptionsInternal(args, resolvePath, DEFAULT_DATA_DIR)
}

const isExecutedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isExecutedDirectly) {
  void cli()
}
