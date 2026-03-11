#!/usr/bin/env node
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_API_PORT } from '@parallax/common'
import { hasFlag, parseCancelOptions, parseLogsOptions, parsePendingOptions, parsePreflightOptions, parsePrReviewOptions, parseRegisterOptions, parseRetryOptions, parseStartOptions, parseStopOptions as parseStopOptionsInternal, resolvePath } from './args.js'
import {
  ensureFileExists,
  loadRegistry as loadRegistryFromDisk,
  loadRunningState as loadRunningStateFromDisk,
  parseConfigProjectIds,
  parseRegistryState,
  parseRunningState,
  resolveCliRoot,
  saveRegistry as saveRegistryToDisk,
  validateConfigFile,
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
import { runPrReview } from './commands/pr-review.js'
import { runRegister } from './commands/register.js'
import { runRetry } from './commands/retry.js'
import { runStart } from './commands/start.js'
import { runStop } from './commands/stop.js'
import type { CliContext } from './types.js'
import { printUsage } from './usage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.parallax')
const DEFAULT_API_BASE = `http://localhost:${DEFAULT_API_PORT}`
const MANIFEST_FILE = 'running.json'
const REGISTRY_FILE = 'registry.json'
const ROOT_DIR = resolveCliRoot(__dirname)

function resolvePackageVersion(rootDir: string): string {
  const candidates = [
    path.resolve(rootDir, 'packages/cli/package.json'),
    path.resolve(rootDir, 'package.json'),
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../package.json'),
  ]

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue
    }

    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string; name?: string }
    if (
      typeof parsed.version === 'string' &&
      (parsed.name === 'parallax-cli' || candidate.endsWith('/packages/cli/package.json'))
    ) {
      return parsed.version
    }
  }

  throw new Error('Unable to resolve CLI version from package.json.')
}

const CLI_VERSION = resolvePackageVersion(ROOT_DIR)

async function resolveDefaultApiBase(): Promise<string> {
  const manifest = await loadRunningStateFromDisk(DEFAULT_DATA_DIR, MANIFEST_FILE)
  return `http://localhost:${manifest.apiPort}`
}

function buildEnvConfig(
  dataDir: string,
  runtime: { apiPort: number; uiPort: number; concurrency: number }
) {
  const existingNodeOptions = process.env.NODE_OPTIONS?.trim()
  const sqliteWarningSuppression = '--disable-warning=ExperimentalWarning'
  const nodeOptions = existingNodeOptions
    ? `${existingNodeOptions} ${sqliteWarningSuppression}`
    : sqliteWarningSuppression

  return {
    NODE_OPTIONS: nodeOptions,
    PARALLAX_DATA_DIR: dataDir,
    PARALLAX_DB_PATH: path.join(dataDir, 'parallax.db'),
    PARALLAX_SERVER_API_PORT: String(runtime.apiPort),
    PARALLAX_SERVER_UI_PORT: String(runtime.uiPort),
    PARALLAX_CONCURRENCY: String(runtime.concurrency),
  }
}

const cliContext: CliContext = {
  defaultApiBase: DEFAULT_API_BASE,
  defaultDataDir: DEFAULT_DATA_DIR,
  manifestFile: MANIFEST_FILE,
  registryFile: REGISTRY_FILE,
  rootDir: ROOT_DIR,
  cliVersion: CLI_VERSION,
  packageVersion: CLI_VERSION,
  resolvePath,
  ensureFileExists,
  loadRunningState: () => loadRunningStateFromDisk(DEFAULT_DATA_DIR, MANIFEST_FILE),
  loadRegistry: () => loadRegistryFromDisk(DEFAULT_DATA_DIR, REGISTRY_FILE),
  saveRegistry: (registry) => saveRegistryToDisk(DEFAULT_DATA_DIR, REGISTRY_FILE, registry),
  resolveDefaultApiBase,
  validateConfigFile,
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
      case 'register':
        await runRegister(commandArgs, cliContext, 'register')
        return
      case 'unregister':
        await runRegister(commandArgs, cliContext, 'unregister')
        return
      case 'pending':
        await runPending(commandArgs, cliContext)
        return
      case 'preflight':
        await runPreflight(commandArgs)
        return
      case 'pr-review':
        await runPrReview(commandArgs, cliContext)
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
  parsePrReviewOptions,
  parseRegisterOptions,
  parseRegistryState,
  parseRetryOptions,
  parseStartOptions,
  parseRunningState,
  resolveApproveTargets,
  resolveRejectTarget,
  resolveDefaultApiBase,
  resolvePath,
  scopePendingTasks,
}

export function parseStopOptions(args: string[]) {
  return parseStopOptionsInternal(args)
}

function isDirectExecution() {
  if (process.argv[1] === undefined) {
    return false
  }

  try {
    const invokedPath = fs.realpathSync(process.argv[1])
    const modulePath = fs.realpathSync(fileURLToPath(import.meta.url))
    return invokedPath === modulePath
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href
  }
}

const isExecutedDirectly = isDirectExecution()

if (isExecutedDirectly) {
  void cli()
}
