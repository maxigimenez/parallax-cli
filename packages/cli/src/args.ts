import path from 'node:path'
import type {
  CancelCommandOptions,
  LogsCommandOptions,
  PendingCommandOptions,
  PreflightCommandOptions,
  RetryCommandOptions,
  StopCommandOptions,
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

export function parseStopOptions(args: string[]): StopCommandOptions {
  return {
    force: hasFlag(args, 'force'),
  }
}

export function parsePendingOptions(args: string[]): PendingCommandOptions {
  const approve = parseOptionalArg(args, 'approve')
  const reject = parseOptionalArg(args, 'reject')
  const approver = parseOptionalArg(args, 'approver')

  if (approve && reject) {
    throw new Error('Use either --approve or --reject, not both.')
  }

  return {
    configPath: parseOptionalArg(args, 'config'),
    approve,
    reject,
    approver,
    json: hasFlag(args, 'json'),
  }
}

export function parseRetryOptions(args: string[]): RetryCommandOptions {
  const taskId = args[0]
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax retry requires <task-id>.')
  }

  const rawMode = parseOptionalArg(args.slice(1), 'mode') ?? 'full'
  if (rawMode !== 'full' && rawMode !== 'execution') {
    throw new Error('--mode must be one of: full, execution.')
  }

  return {
    taskId,
    mode: rawMode,
  }
}

export function parseCancelOptions(args: string[]): CancelCommandOptions {
  const taskId = args[0]
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax cancel requires <task-id>.')
  }

  return {
    taskId,
  }
}

export function parseLogsOptions(args: string[]): LogsCommandOptions {
  const taskId = parseOptionalArg(args, 'task')
  const rawSince = parseOptionalArg(args, 'since')
  let since: number | undefined
  if (rawSince !== undefined) {
    since = Number.parseInt(rawSince, 10)
    if (!Number.isFinite(since) || since < 0) {
      throw new Error('--since must be a non-negative integer epoch timestamp.')
    }
  }

  return {
    apiBase: parseOptionalArg(args, 'api') ?? '',
    taskId: taskId ?? undefined,
    since,
  }
}

export function parsePreflightOptions(args: string[]): PreflightCommandOptions {
  if (args.length > 0) {
    throw new Error('parallax preflight does not accept flags.')
  }

  return {}
}

export function resolvePath(raw: string): string {
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}
