import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import {
  LOG_LEVEL,
  RUN_LOG_KIND,
  RUN_LOG_LEVEL,
  RUN_LOG_SOURCE,
  type Logger,
  type LogLevel,
  type RunLogEntry,
} from '@sentinel0/common'
import { getDatabase, type Sentinel0Database } from './database.js'

const LOG_ICON = {
  info: chalk.blue('i'),
  success: chalk.green('v'),
  warning: chalk.yellow('!'),
  error: chalk.red('x'),
} as const

let currentLogLevels: LogLevel[] = [
  LOG_LEVEL.INFO,
  LOG_LEVEL.SUCCESS,
  LOG_LEVEL.WARN,
  LOG_LEVEL.ERROR,
]

export function setLogLevels(levels: LogLevel[]): void {
  currentLogLevels = levels
}

/**
 * Database handle used for run-scoped events.
 *
 * Injectable so tests can capture events without touching disk, and so the
 * logger does not force a database open just by being imported.
 */
let database: Sentinel0Database | undefined

export function setLoggerDatabase(db: Sentinel0Database | undefined): void {
  database = db
}

function db(): Sentinel0Database {
  return database ?? getDatabase()
}

/**
 * When a line was written, as `2026-09-03T10:07:26.481Z`.
 *
 * ISO-8601 in UTC rather than a friendlier local time, because these lines are
 * read out of `runner.stdout.log` days later and lined up against Hermes run
 * timings and the cloud's `created_at` — both of which are UTC. A local
 * timestamp with no offset is the one format that cannot be reconciled with
 * either, and a log file spanning several days needs the date as much as the
 * time.
 */
function timestamp(at: number = Date.now()): string {
  return new Date(at).toISOString()
}

/**
 * @param at When this was recorded, if that is not simply now. A run event
 *   stamps its own time before it is persisted, and the console line has to
 *   report that same instant -- otherwise the log and the stored event disagree
 *   about when an error happened, which is the one thing they are both for.
 */
function stamp(level: LogLevel, message: string, runId?: string, at?: number): void {
  if (!currentLogLevels.includes(level)) {
    return
  }
  const icon = level === LOG_LEVEL.WARN ? LOG_ICON.warning : LOG_ICON[level]
  const prefix = runId ? chalk.dim(`[${runId}] `) : ''
  // The time leads the line so a `sort`, a `grep` for a date, or an eye
  // scanning the left edge all work. Dimmed because it is context, not content.
  const line = `${chalk.dim(timestamp(at))} ${icon} ${prefix}${message}`
  if (level === LOG_LEVEL.ERROR) {
    console.error(line)
  } else {
    console.log(line)
  }
}

/**
 * Persists one run-scoped event and echoes it to the console.
 *
 * Every event lands in SQLite, which is the runner's source of truth and what
 * `sentinel0 logs` reads. Persistence failures are reported but never thrown:
 * a full disk should degrade observability, not kill a run mid-flight.
 */
function writeRunEvent(runId: string, entry: RunLogEntry): void {
  try {
    db().appendRunEvent(runId, entry)
  } catch (error: unknown) {
    stamp(
      LOG_LEVEL.WARN,
      `Failed to persist run event: ${error instanceof Error ? error.message : String(error)}`,
      runId
    )
  }
}

export const logger: Logger = {
  info: (msg, runId) => stamp(LOG_LEVEL.INFO, msg, runId),
  success: (msg, runId) => stamp(LOG_LEVEL.SUCCESS, msg, runId),
  warn: (msg, runId) => stamp(LOG_LEVEL.WARN, msg, runId),
  error: (msg, runId) => stamp(LOG_LEVEL.ERROR, msg, runId),

  event: ({ runId, title, message, level, kind, source, icon, groupId }) => {
    const entry: RunLogEntry = {
      title,
      message: stripAnsi(message),
      icon: icon ?? '.',
      level: level ?? RUN_LOG_LEVEL.INFO,
      timestamp: Date.now(),
      kind,
      source,
      groupId,
    }

    writeRunEvent(runId, entry)

    if (entry.level === RUN_LOG_LEVEL.ERROR) {
      stamp(
        LOG_LEVEL.ERROR,
        `${entry.title ? `${entry.title}: ` : ''}${entry.message}`,
        runId,
        entry.timestamp
      )
    }
  },
}

/** Convenience for lifecycle transitions, which are always system-sourced. */
export function logLifecycle(runId: string, message: string, icon = '.'): void {
  logger.event({
    runId,
    message,
    icon,
    kind: RUN_LOG_KIND.LIFECYCLE,
    source: RUN_LOG_SOURCE.SYSTEM,
  })
  stamp(LOG_LEVEL.INFO, message, runId)
}
