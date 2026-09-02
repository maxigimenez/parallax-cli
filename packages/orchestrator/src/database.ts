import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import {
  RUN_STATUS,
  isTerminalRunStatus,
  type RunLogEntry,
  type RunRecord,
  type RunStatus,
  type RunUsage,
  type TriggerChanges,
} from '@parallax/common'

/** Members of `next` that were not in `previous`, compared case-insensitively. */
function added(previous: string[], next: string[]): string[] {
  const before = new Set(previous.map((value) => value.toLowerCase()))
  return next.filter((value) => !before.has(value.toLowerCase()))
}

export function resolveDbPath(): string {
  if (process.env.PARALLAX_DB_PATH) {
    return process.env.PARALLAX_DB_PATH === 'memory'
      ? 'memory'
      : path.resolve(process.env.PARALLAX_DB_PATH)
  }
  if (process.env.PARALLAX_DATA_DIR) {
    return path.resolve(process.env.PARALLAX_DATA_DIR, 'parallax.db')
  }
  return path.resolve(process.cwd(), 'parallax.db')
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      routeId TEXT NOT NULL,
      routeName TEXT NOT NULL,
      agentProfile TEXT NOT NULL,
      projectId TEXT NOT NULL,
      triggerType TEXT NOT NULL,
      triggerRef TEXT NOT NULL,
      triggerRevision TEXT NOT NULL,
      triggerUrl TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      hermesRunId TEXT,
      hermesSessionId TEXT,
      summary TEXT,
      error TEXT,
      usage TEXT,
      startedAt INTEGER,
      endedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `)

  // `runId` here is the run's actual primary key. The predecessor table called
  // this column `taskExternalId` while storing the internal id -- a misnomer
  // that cost real debugging time. Naming it for what it holds is the fix.
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId TEXT NOT NULL,
      title TEXT,
      message TEXT NOT NULL,
      icon TEXT NOT NULL,
      level TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      groupId TEXT
    );
  `)

  // The dedupe ledger. The primary key IS the concurrency control: claiming a
  // dispatch is one INSERT OR IGNORE, so the poll loop cannot double-fire a
  // route for an unchanged ticket even if two cycles overlap.
  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatch_ledger (
      dedupeKey TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      routeId TEXT NOT NULL,
      triggerRef TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `)

  // What each item looked like last cycle, so "label added" can mean added
  // rather than merely present.
  db.exec(`
    CREATE TABLE IF NOT EXISTS observations (
      projectId  TEXT NOT NULL,
      ref        TEXT NOT NULL,
      labels     TEXT NOT NULL,
      assignees  TEXT NOT NULL,
      reviewers  TEXT NOT NULL,
      observedAt INTEGER NOT NULL,
      PRIMARY KEY (projectId, ref)
    );
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_updated ON runs(updatedAt DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, updatedAt DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agentProfile, status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(runId, timestamp, id)')
}

interface RunRow {
  id: string
  routeId: string
  routeName: string
  agentProfile: string
  projectId: string
  triggerType: string
  triggerRef: string
  triggerRevision: string
  triggerUrl: string | null
  title: string
  status: string
  hermesRunId: string | null
  hermesSessionId: string | null
  summary: string | null
  error: string | null
  usage: string | null
  startedAt: number | null
  endedAt: number | null
  createdAt: number
  updatedAt: number
}

function toRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    routeId: row.routeId,
    routeName: row.routeName,
    agentProfile: row.agentProfile,
    projectId: row.projectId,
    triggerType: row.triggerType as RunRecord['triggerType'],
    triggerRef: row.triggerRef,
    triggerRevision: row.triggerRevision,
    triggerUrl: row.triggerUrl ?? undefined,
    title: row.title,
    status: row.status as RunStatus,
    hermesRunId: row.hermesRunId ?? undefined,
    hermesSessionId: row.hermesSessionId ?? undefined,
    summary: row.summary ?? undefined,
    error: row.error ?? undefined,
    usage: row.usage ? (JSON.parse(row.usage) as RunUsage) : undefined,
    startedAt: row.startedAt ?? undefined,
    endedAt: row.endedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export interface ListRunsOptions {
  limit?: number
  projectId?: string
  status?: RunStatus
}

export interface RunPatch {
  status?: RunStatus
  hermesRunId?: string
  hermesSessionId?: string
  summary?: string
  error?: string
  usage?: RunUsage
  startedAt?: number
  endedAt?: number
}

export class ParallaxDatabase {
  constructor(private readonly db: DatabaseSync) {
    migrate(db)
  }

  createRun(run: RunRecord): void {
    this.db
      .prepare(
        `INSERT INTO runs (
          id, routeId, routeName, agentProfile, projectId,
          triggerType, triggerRef, triggerRevision, triggerUrl,
          title, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.routeId,
        run.routeName,
        run.agentProfile,
        run.projectId,
        run.triggerType,
        run.triggerRef,
        run.triggerRevision,
        run.triggerUrl ?? null,
        run.title,
        run.status,
        run.createdAt,
        run.updatedAt
      )
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined
    return row ? toRun(row) : undefined
  }

  listRuns(options: ListRunsOptions = {}): RunRecord[] {
    const clauses: string[] = []
    const params: Array<string | number> = []

    if (options.projectId) {
      clauses.push('projectId = ?')
      params.push(options.projectId)
    }
    if (options.status) {
      clauses.push('status = ?')
      params.push(options.status)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
    params.push(limit)

    const rows = this.db
      .prepare(`SELECT * FROM runs ${where} ORDER BY updatedAt DESC LIMIT ?`)
      .all(...params) as unknown as RunRow[]

    return rows.map(toRun)
  }

  updateRun(id: string, patch: RunPatch, now: number = Date.now()): void {
    const sets: string[] = ['updatedAt = ?']
    const params: Array<string | number | null> = [now]

    const assign = (column: string, value: string | number | null | undefined): void => {
      if (value !== undefined) {
        sets.push(`${column} = ?`)
        params.push(value)
      }
    }

    assign('status', patch.status)
    assign('hermesRunId', patch.hermesRunId)
    assign('hermesSessionId', patch.hermesSessionId)
    assign('summary', patch.summary)
    assign('error', patch.error)
    assign('startedAt', patch.startedAt)
    assign('endedAt', patch.endedAt)
    assign('usage', patch.usage ? JSON.stringify(patch.usage) : undefined)

    params.push(id)
    this.db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }

  /**
   * Runs currently occupying an agent.
   *
   * Hermes corrupts a profile's memory if two agents drive it at once, so the
   * dispatcher consults this before starting work on a profile.
   */
  countActiveRunsForAgent(agentProfile: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM runs
         WHERE agentProfile = ? AND status IN (?, ?, ?)`
      )
      .get(agentProfile, RUN_STATUS.QUEUED, RUN_STATUS.RUNNING, RUN_STATUS.AWAITING_APPROVAL) as {
      count: number
    }
    return row.count
  }

  listUnfinishedRuns(): RunRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM runs WHERE status IN (?, ?, ?) ORDER BY createdAt ASC')
      .all(
        RUN_STATUS.QUEUED,
        RUN_STATUS.RUNNING,
        RUN_STATUS.AWAITING_APPROVAL
      ) as unknown as RunRow[]
    return rows.map(toRun)
  }

  // ── Events ─────────────────────────────────────────────────

  appendRunEvent(runId: string, entry: RunLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO run_events (runId, title, message, icon, level, timestamp, kind, source, groupId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        runId,
        entry.title ?? null,
        entry.message,
        entry.icon,
        entry.level,
        entry.timestamp,
        entry.kind,
        entry.source,
        entry.groupId ?? null
      )
  }

  listRunEvents(runId: string, options: { since?: number; limit?: number } = {}): RunLogEntry[] {
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000)
    const rows = this.db
      .prepare(
        `SELECT title, message, icon, level, timestamp, kind, source, groupId
         FROM run_events WHERE runId = ? AND timestamp >= ?
         ORDER BY timestamp ASC, id ASC LIMIT ?`
      )
      .all(runId, options.since ?? 0, limit) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      title: (row.title as string | null) ?? undefined,
      message: row.message as string,
      icon: row.icon as string,
      level: row.level as RunLogEntry['level'],
      timestamp: row.timestamp as number,
      kind: row.kind as RunLogEntry['kind'],
      source: row.source as RunLogEntry['source'],
      groupId: (row.groupId as string | null) ?? undefined,
    }))
  }

  // ── Observations ───────────────────────────────────────────

  /**
   * Records what an item looks like now and reports what changed.
   *
   * Returns undefined the first time an item is seen. That is deliberate: with
   * no prior observation every label looks newly added, and a freshly created
   * route would fire across an entire existing backlog. First sight seeds the
   * baseline silently; only a genuine subsequent change produces transitions.
   */
  observe(
    projectId: string,
    ref: string,
    current: { labels: string[]; assignees: string[]; reviewers: string[] },
    now: number = Date.now()
  ): TriggerChanges | undefined {
    const row = this.db
      .prepare(
        'SELECT labels, assignees, reviewers FROM observations WHERE projectId = ? AND ref = ?'
      )
      .get(projectId, ref) as { labels: string; assignees: string; reviewers: string } | undefined

    this.db
      .prepare(
        `INSERT INTO observations (projectId, ref, labels, assignees, reviewers, observedAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (projectId, ref) DO UPDATE SET
           labels = excluded.labels,
           assignees = excluded.assignees,
           reviewers = excluded.reviewers,
           observedAt = excluded.observedAt`
      )
      .run(
        projectId,
        ref,
        JSON.stringify(current.labels),
        JSON.stringify(current.assignees),
        JSON.stringify(current.reviewers),
        now
      )

    if (!row) {
      return undefined
    }

    const previous = {
      labels: JSON.parse(row.labels) as string[],
      assignees: JSON.parse(row.assignees) as string[],
      reviewers: JSON.parse(row.reviewers) as string[],
    }

    return {
      labelsAdded: added(previous.labels, current.labels),
      labelsRemoved: added(current.labels, previous.labels),
      assigneesAdded: added(previous.assignees, current.assignees),
      assigneesRemoved: added(current.assignees, previous.assignees),
      reviewersAdded: added(previous.reviewers, current.reviewers),
    }
  }

  pruneObservations(olderThan: number): number {
    const result = this.db.prepare('DELETE FROM observations WHERE observedAt < ?').run(olderThan)
    return Number(result.changes)
  }

  // ── Dispatch ledger ────────────────────────────────────────

  /**
   * Atomically claim the right to dispatch this (route, trigger, revision).
   *
   * Returns false when the key was already claimed, which is the normal case:
   * every poll cycle re-observes every open ticket, and only a genuine change
   * to the ticket produces a new revision and therefore a new key.
   */
  claimDispatch(
    dedupeKey: string,
    claim: { runId: string; routeId: string; triggerRef: string },
    now: number = Date.now()
  ): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO dispatch_ledger (dedupeKey, runId, routeId, triggerRef, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(dedupeKey, claim.runId, claim.routeId, claim.triggerRef, now)

    return Number(result.changes) > 0
  }

  /**
   * Undo a claim. Used when dispatch fails before the agent was ever reached,
   * so a transient error does not permanently suppress that trigger.
   */
  releaseDispatch(dedupeKey: string): void {
    this.db.prepare('DELETE FROM dispatch_ledger WHERE dedupeKey = ?').run(dedupeKey)
  }

  hasDispatched(dedupeKey: string): boolean {
    return (
      this.db.prepare('SELECT 1 FROM dispatch_ledger WHERE dedupeKey = ?').get(dedupeKey) !==
      undefined
    )
  }

  /** Drops ledger rows whose runs have long since finished. */
  pruneDispatchLedger(olderThan: number): number {
    const result = this.db.prepare('DELETE FROM dispatch_ledger WHERE createdAt < ?').run(olderThan)
    return Number(result.changes)
  }

  close(): void {
    this.db.close()
  }
}

export function openDatabase(dbPath: string = resolveDbPath()): ParallaxDatabase {
  return new ParallaxDatabase(new DatabaseSync(dbPath === 'memory' ? ':memory:' : dbPath))
}

export { isTerminalRunStatus }

let singleton: ParallaxDatabase | undefined

/**
 * Process-wide handle, opened on first use.
 *
 * Lazy on purpose: the previous module-level `const db = new DatabaseSync(...)`
 * created a SQLite file as an import side effect, so merely importing this
 * module from a CLI command or a test wrote a stray `parallax.db` into the cwd.
 * Tests should open their own with `openDatabase('memory')`.
 */
export function getDatabase(): ParallaxDatabase {
  singleton ??= openDatabase()
  return singleton
}

/** Test seam: point the process-wide handle at an explicit database. */
export function setDatabase(db: ParallaxDatabase): void {
  singleton = db
}
