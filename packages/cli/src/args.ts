import path from 'node:path'
import type {
  CancelCommandOptions,
  LogsCommandOptions,
  PendingCommandOptions,
  PreflightCommandOptions,
  PrReviewCommandOptions,
  RegisterCommandOptions,
  RetryCommandOptions,
  StartCommandOptions,
  StopCommandOptions,
  StatusCommandOptions,
} from './types.js'

export function parseArg(args: string[], key: string): string | undefined {
  const keyWithPrefix = `--${key}`
  const valueIdx = args.findIndex((entry) => entry === keyWithPrefix)

  if (valueIdx >= 0 && args[valueIdx + 1]) {
    return args[valueIdx + 1]
  }

  const inlineEntry = args.find((entry) => entry.startsWith(`${keyWithPrefix}=`))
  if (inlineEntry) {
    return inlineEntry.slice(keyWithPrefix.length + 1)
  }

  return undefined
}

export function hasFlag(args: string[], key: string): boolean {
  const keyWithPrefix = `--${key}`
  return args.includes(keyWithPrefix) || args.some((entry) => entry.startsWith(`${keyWithPrefix}=`))
}

export function parseArgValue(args: string[], key: string): string {
  const value = parseArg(args, key)
  if (!hasFlag(args, key)) {
    throw new Error(`Unexpected parser state: --${key} is not set.`)
  }

  if (!value || !value.trim()) {
    throw new Error(`Missing value for --${key}.`)
  }

  return value
}

export function parseOptionalArg(args: string[], key: string): string | undefined {
  if (!hasFlag(args, key)) {
    return undefined
  }

  return parseArgValue(args, key)
}

function parseStrictPort(args: string[], key: string, fallback: number): number {
  const raw = parseOptionalArg(args, key)
  if (raw === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`--${key} must be an integer between 1 and 65535.`)
  }

  return parsed
}

export function parseStartOptions(args: string[]): StartCommandOptions {
  const allowedFlags = new Set(['--server-api-port', '--server-ui-port', '--concurrency'])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg.startsWith('--')) {
      const flag = arg.includes('=') ? arg.split('=')[0] : arg
      if (!allowedFlags.has(flag)) {
        throw new Error(`Unsupported flag for parallax start: ${arg}`)
      }
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    throw new Error('parallax start accepts flags only.')
  }

  const apiPort = parseStrictPort(args, 'server-api-port', 3000)
  const uiPort = parseStrictPort(args, 'server-ui-port', 8080)
  const rawConcurrency = parseOptionalArg(args, 'concurrency')
  const concurrency = rawConcurrency === undefined ? 2 : Number.parseInt(rawConcurrency, 10)

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('--concurrency must be an integer between 1 and 16.')
  }

  if (apiPort === uiPort) {
    throw new Error('--server-api-port and --server-ui-port must be different.')
  }

  return { apiPort, uiPort, concurrency }
}

export function parseStopOptions(args: string[]): StopCommandOptions {
  if (args.length > 0) {
    throw new Error('parallax stop does not accept flags.')
  }

  return {}
}

export function parsePendingOptions(args: string[]): PendingCommandOptions {
  const allowedFlags = new Set(['--approve', '--reject'])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg.startsWith('--')) {
      const flag = arg.includes('=') ? arg.split('=')[0] : arg
      if (!allowedFlags.has(flag)) {
        throw new Error(`Unsupported flag for parallax pending: ${arg}`)
      }
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    throw new Error('parallax pending accepts flags only.')
  }

  const approve = parseOptionalArg(args, 'approve')
  const reject = parseOptionalArg(args, 'reject')

  if (approve && reject) {
    throw new Error('Use either --approve or --reject, not both.')
  }
  return {
    approve,
    reject,
  }
}

export function parseRetryOptions(args: string[]): RetryCommandOptions {
  const taskId = args[0]
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax retry requires <task-id>.')
  }

  if (args.length > 1) {
    throw new Error('parallax retry does not accept flags.')
  }

  return {
    taskId,
  }
}

export function parseCancelOptions(args: string[]): CancelCommandOptions {
  const taskId = args[0]
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax cancel requires <task-id>.')
  }

  if (args.length > 1) {
    throw new Error('parallax cancel does not accept flags.')
  }

  return {
    taskId,
  }
}

export function parsePrReviewOptions(args: string[]): PrReviewCommandOptions {
  const taskId = args[0]

  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax pr-review requires <task-id>.')
  }

  if (args.length > 1) {
    throw new Error('parallax pr-review does not accept flags.')
  }

  return {
    taskId,
  }
}

export function parseLogsOptions(args: string[]): LogsCommandOptions {
  const allowedFlags = new Set(['--task'])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg.startsWith('--')) {
      const flag = arg.includes('=') ? arg.split('=')[0] : arg
      if (!allowedFlags.has(flag)) {
        throw new Error('parallax logs only accepts optional --task <task-id>.')
      }
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg !== undefined) {
      throw new Error('parallax logs only accepts optional --task <task-id>.')
    }
  }

  const taskId = parseOptionalArg(args, 'task')

  return {
    taskId: taskId ?? undefined,
  }
}

export function parsePreflightOptions(args: string[]): PreflightCommandOptions {
  if (args.length > 0) {
    throw new Error('parallax preflight does not accept flags.')
  }

  return {}
}

export function parseStatusOptions(args: string[]): StatusCommandOptions {
  if (args.length > 0) {
    throw new Error('parallax status does not accept flags.')
  }

  return {}
}

export function parseRegisterOptions(
  args: string[],
  command: 'register' | 'unregister'
): RegisterCommandOptions {
  const configPath = args[0]
  if (!configPath || configPath.startsWith('--')) {
    throw new Error(`parallax ${command} requires <config-file>.`)
  }

  const envFilePath = parseOptionalArg(args.slice(1), 'env-file')
  const allowedFlags = command === 'register' ? new Set(['--env-file']) : new Set<string>()
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      throw new Error(`parallax ${command} accepts exactly one <config-file>.`)
    }

    const flag = arg.includes('=') ? arg.split('=')[0] : arg
    if (!allowedFlags.has(flag)) {
      throw new Error(`Unsupported flag for parallax ${command}: ${arg}`)
    }
    if (!arg.includes('=')) {
      index += 1
    }
  }

  if (command === 'unregister' && envFilePath !== undefined) {
    throw new Error('parallax unregister does not accept flags.')
  }

  const positionalArgs = args.slice(1).filter((entry, index, entries) => {
    const previous = entries[index - 1]
    if (previous === '--env-file') {
      return false
    }
    return !entry.startsWith('--')
  })
  if (positionalArgs.length > 0) {
    throw new Error(`parallax ${command} accepts exactly one <config-file>.`)
  }

  return {
    configPath,
    envFilePath,
  }
}

export function resolvePath(raw: string): string {
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}
