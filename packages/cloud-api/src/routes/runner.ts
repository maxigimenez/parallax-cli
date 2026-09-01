import type { FastifyInstance } from 'fastify'
import type { AgentDescriptor, RoutingRule, RunLogEntry, RunRecord } from '@parallax/common'
import { authenticate, newId, parseBearer, type AuthContext } from '../auth.js'
import type { Database } from '../db.js'
import { notifyRunEvent } from '../notifications/slack.js'

/** How long a command long-poll may be held open. */
const MAX_WAIT_SECONDS = 30
const POLL_TICK_MS = 500

async function requireRunner(
  db: Database,
  header: string | undefined
): Promise<AuthContext | undefined> {
  return authenticate(db, parseBearer(header), 'runner')
}

export function registerRunnerRoutes(app: FastifyInstance, db: Database): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/v1/runner/')) {
      return
    }
    const auth = await requireRunner(db, request.headers.authorization)
    if (!auth) {
      return reply.code(401).send({ error: 'A runner API key is required.' })
    }
    ;(request as { auth?: AuthContext }).auth = auth
  })

  const authOf = (request: unknown): AuthContext => (request as { auth: AuthContext }).auth

  // ── Registration / heartbeat ───────────────────────────────

  app.post('/v1/runner/hello', async (request) => {
    const { orgId } = authOf(request)
    const { name, hostname, version } = request.body as {
      name: string
      hostname?: string
      version?: string
    }

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO runners (id, org_id, name, hostname, version, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (org_id, name)
       DO UPDATE SET hostname = EXCLUDED.hostname,
                     version = EXCLUDED.version,
                     last_seen_at = now()
       RETURNING id`,
      [newId('rnr'), orgId, name, hostname ?? null, version ?? null]
    )

    return { runnerId: rows[0].id, routesRevision: String(Date.now()) }
  })

  // ── Inventory ──────────────────────────────────────────────

  app.put('/v1/runner/inventory', async (request, reply) => {
    const { orgId } = authOf(request)
    const { agents } = request.body as { agents: AgentDescriptor[] }

    const runner = await currentRunner(db, orgId)
    if (!runner) {
      return reply.code(409).send({ error: 'Call /v1/runner/hello before pushing inventory.' })
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      // Inventory is derived state: replacing it wholesale is what makes a
      // deleted Hermes profile disappear from the registry rather than linger.
      await client.query('DELETE FROM agents WHERE runner_id = $1', [runner])
      for (const agent of agents) {
        await client.query(
          `INSERT INTO agents (id, org_id, runner_id, profile, display_name, role, model,
                               provider, toolsets, skills, github_login, avatar_url,
                               enabled, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())`,
          [
            newId('agt'),
            orgId,
            runner,
            agent.profile,
            agent.displayName ?? null,
            agent.role ?? null,
            agent.model ?? null,
            agent.provider ?? null,
            JSON.stringify(agent.toolsets ?? []),
            JSON.stringify(agent.skills ?? []),
            agent.githubLogin ?? null,
            agent.avatarUrl ?? null,
            agent.enabled,
          ]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return { ok: true, count: agents.length }
  })

  // ── Projects ───────────────────────────────────────────────

  // The runner has no project configuration of its own: what to watch is
  // decided in the cloud, so it has to be able to read it back.
  app.get('/v1/runner/projects', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query<{ id: string; provider: string; filters: unknown }>(
      'SELECT id, provider, filters FROM projects WHERE org_id = $1 ORDER BY id',
      [orgId]
    )
    return { projects: rows }
  })

  // ── Routes ─────────────────────────────────────────────────

  app.get('/v1/runner/routes', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query<{ definition: RoutingRule; updated_at: Date }>(
      'SELECT definition, updated_at FROM routes WHERE org_id = $1 AND enabled = true ORDER BY priority DESC',
      [orgId]
    )
    const revision = rows.reduce(
      (latest: number, row) => Math.max(latest, new Date(row.updated_at).getTime()),
      0
    )
    return { revision: String(revision), routes: rows.map((row) => row.definition) }
  })

  // ── Command inbox (long poll) ──────────────────────────────

  app.get('/v1/runner/commands', async (request) => {
    const { orgId } = authOf(request)
    const query = request.query as { cursor?: string; wait?: string }
    const cursor = Number.parseInt(query.cursor ?? '0', 10) || 0
    const wait = Math.min(Number.parseInt(query.wait ?? '25', 10) || 25, MAX_WAIT_SECONDS)

    const deadline = Date.now() + wait * 1_000

    // Poll the table rather than using LISTEN/NOTIFY: it survives connection
    // churn and pooling, and at one runner per org the cost is negligible.
    for (;;) {
      const commands = await fetchCommands(db, orgId, cursor)
      if (commands.length > 0 || Date.now() >= deadline) {
        return { commands }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_TICK_MS))
    }
  })

  app.post('/v1/runner/commands/ack', async (request) => {
    const { orgId } = authOf(request)
    const { cursor } = request.body as { cursor: number }
    await db.query(
      'UPDATE runner_commands SET acked_at = now() WHERE org_id = $1 AND cursor <= $2 AND acked_at IS NULL',
      [orgId, cursor]
    )
    return { ok: true }
  })

  // ── Run mirroring ──────────────────────────────────────────

  app.post('/v1/runner/runs', async (request) => {
    const { orgId } = authOf(request)
    const { run } = request.body as { run: RunRecord }
    await upsertRun(db, orgId, await currentRunner(db, orgId), run)
    await notifyRunEvent(db, orgId, run, 'run.started')
    return { ok: true }
  })

  app.patch('/v1/runner/runs/:runId', async (request) => {
    const { orgId } = authOf(request)
    const { run } = request.body as { run: RunRecord }
    await upsertRun(db, orgId, await currentRunner(db, orgId), run)
    await notifyRunEvent(db, orgId, run, statusEvent(run.status))
    return { ok: true }
  })

  app.post('/v1/runner/runs/:runId/events', async (request) => {
    const { runId } = request.params as { runId: string }
    const { events } = request.body as { events: RunLogEntry[] }

    for (const event of events) {
      await db.query(
        `INSERT INTO run_events (run_id, title, message, icon, level, kind, source, group_id, ts)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          runId,
          event.title ?? null,
          event.message,
          event.icon ?? null,
          event.level,
          event.kind,
          event.source,
          event.groupId ?? null,
          event.timestamp,
        ]
      )
    }
    return { ok: true, count: events.length }
  })
}

function statusEvent(status: string): string {
  switch (status) {
    case 'completed':
      return 'run.completed'
    case 'failed':
      return 'run.failed'
    case 'canceled':
      return 'run.canceled'
    case 'awaiting_approval':
      return 'run.needs_approval'
    default:
      return 'run.started'
  }
}

async function currentRunner(db: Database, orgId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM runners WHERE org_id = $1 ORDER BY last_seen_at DESC LIMIT 1',
    [orgId]
  )
  return rows[0]?.id ?? null
}

interface CommandRow {
  cursor: string
  id: string
  type: 'run' | 'cancel' | 'resync'
  payload: Record<string, unknown>
}

async function fetchCommands(db: Database, orgId: string, cursor: number) {
  const { rows } = await db.query<CommandRow>(
    `SELECT cursor, id, type, payload FROM runner_commands
     WHERE org_id = $1 AND cursor > $2 AND acked_at IS NULL
     ORDER BY cursor ASC LIMIT 50`,
    [orgId, cursor]
  )
  return rows.map((row) => ({
    id: row.id,
    cursor: Number(row.cursor),
    type: row.type,
    payload: row.payload,
  }))
}

async function upsertRun(
  db: Database,
  orgId: string,
  runnerId: string | null,
  run: RunRecord
): Promise<void> {
  await db.query(
    `INSERT INTO runs (id, org_id, runner_id, route_id, route_name, agent_profile, project_id,
                       trigger_type, trigger_ref, trigger_url, title, status, hermes_run_id,
                       summary, error, usage, started_at, ended_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             to_timestamp($17::double precision / 1000), to_timestamp($18::double precision / 1000),
             to_timestamp($19::double precision / 1000), now())
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       hermes_run_id = COALESCE(EXCLUDED.hermes_run_id, runs.hermes_run_id),
       summary = COALESCE(EXCLUDED.summary, runs.summary),
       error = COALESCE(EXCLUDED.error, runs.error),
       usage = COALESCE(EXCLUDED.usage, runs.usage),
       started_at = COALESCE(EXCLUDED.started_at, runs.started_at),
       ended_at = COALESCE(EXCLUDED.ended_at, runs.ended_at),
       updated_at = now()`,
    [
      run.id,
      orgId,
      runnerId,
      run.routeId,
      run.routeName,
      run.agentProfile,
      run.projectId,
      run.triggerType,
      run.triggerRef,
      run.triggerUrl ?? null,
      run.title,
      run.status,
      run.hermesRunId ?? null,
      run.summary ?? null,
      run.error ?? null,
      run.usage ? JSON.stringify(run.usage) : null,
      run.startedAt ?? null,
      run.endedAt ?? null,
      run.createdAt,
    ]
  )
}
