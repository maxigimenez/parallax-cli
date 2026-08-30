import type { FastifyInstance } from 'fastify'
import type { RoutingRule } from '@parallax/common'
import { authenticate, generateKey, newId, parseBearer, type AuthContext } from '../auth.js'
import type { Database } from '../db.js'

/**
 * The human-facing API.
 *
 * This is the contract `packages/dashboard` will consume, so it is shaped for a
 * UI from the start: list endpoints are paged, mutations return the stored
 * object, and nothing here requires knowing how the runner works.
 */
export function registerUserRoutes(app: FastifyInstance, db: Database): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/v1/') || request.url.startsWith('/v1/runner/')) {
      return
    }
    const auth = await authenticate(db, parseBearer(request.headers.authorization), 'user')
    if (!auth) {
      return reply.code(401).send({ error: 'A user API key is required.' })
    }
    ;(request as { auth?: AuthContext }).auth = auth
  })

  const authOf = (request: unknown): AuthContext => (request as { auth: AuthContext }).auth

  // ── Runners and agents ─────────────────────────────────────

  app.get('/v1/runners', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query(
      `SELECT id, name, hostname, version, last_seen_at,
              (last_seen_at < now() - interval '90 seconds') AS stale
       FROM runners WHERE org_id = $1 ORDER BY name`,
      [orgId]
    )
    return { runners: rows }
  })

  app.get('/v1/agents', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query(
      `SELECT a.id, a.profile, a.display_name, a.role, a.model, a.provider,
              a.toolsets, a.skills, a.github_login, a.enabled, a.synced_at, r.name AS runner
       FROM agents a JOIN runners r ON r.id = a.runner_id
       WHERE a.org_id = $1 ORDER BY a.profile`,
      [orgId]
    )
    return { agents: rows }
  })

  // ── Projects ───────────────────────────────────────────────

  app.get('/v1/projects', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query(
      'SELECT id, provider, filters FROM projects WHERE org_id = $1 ORDER BY id',
      [orgId]
    )
    return { projects: rows }
  })

  app.post('/v1/projects', async (request, reply) => {
    const { orgId } = authOf(request)
    const body = request.body as { id?: string; provider?: string; filters?: unknown }

    if (!body.id || !body.provider) {
      return reply.code(400).send({ error: 'id and provider are required.' })
    }
    if (body.provider !== 'github' && body.provider !== 'linear') {
      return reply.code(400).send({ error: 'provider must be "github" or "linear".' })
    }

    await db.query(
      `INSERT INTO projects (id, org_id, provider, filters) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET provider = EXCLUDED.provider, filters = EXCLUDED.filters`,
      [body.id, orgId, body.provider, JSON.stringify(body.filters ?? {})]
    )
    return reply.code(201).send({ id: body.id })
  })

  app.delete('/v1/projects/:id', async (request) => {
    const { orgId } = authOf(request)
    const { id } = request.params as { id: string }
    await db.query('DELETE FROM projects WHERE org_id = $1 AND id = $2', [orgId, id])
    return { ok: true }
  })

  // ── Routes ─────────────────────────────────────────────────

  app.get('/v1/routes', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query<{ definition: RoutingRule }>(
      'SELECT definition FROM routes WHERE org_id = $1 ORDER BY priority DESC, id',
      [orgId]
    )
    return { routes: rows.map((row: { definition: RoutingRule }) => row.definition) }
  })

  app.post('/v1/routes', async (request, reply) => {
    const { orgId } = authOf(request)
    const route = request.body as RoutingRule

    const problem = validateRoute(route)
    if (problem) {
      return reply.code(400).send({ error: problem })
    }

    const id = route.id || newId('rt')
    const stored: RoutingRule = { ...route, id }

    await db.query(
      `INSERT INTO routes (id, org_id, name, priority, enabled, definition, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, priority = EXCLUDED.priority,
                                      enabled = EXCLUDED.enabled, definition = EXCLUDED.definition,
                                      updated_at = now()`,
      [
        id,
        orgId,
        stored.name,
        stored.priority ?? 0,
        stored.enabled !== false,
        JSON.stringify(stored),
      ]
    )
    return reply.code(201).send({ route: stored })
  })

  app.delete('/v1/routes/:id', async (request) => {
    const { orgId } = authOf(request)
    const { id } = request.params as { id: string }
    await db.query('DELETE FROM routes WHERE org_id = $1 AND id = $2', [orgId, id])
    return { ok: true }
  })

  // ── Runs ───────────────────────────────────────────────────

  app.get('/v1/runs', async (request) => {
    const { orgId } = authOf(request)
    const query = request.query as { limit?: string; status?: string }
    const limit = Math.min(Number.parseInt(query.limit ?? '50', 10) || 50, 200)

    const { rows } = await db.query(
      `SELECT id, route_name, agent_profile, project_id, trigger_ref, trigger_url, title,
              status, summary, error, started_at, ended_at, updated_at
       FROM runs WHERE org_id = $1 AND ($2::text IS NULL OR status = $2)
       ORDER BY updated_at DESC LIMIT $3`,
      [orgId, query.status ?? null, limit]
    )
    return { runs: rows }
  })

  app.get('/v1/runs/:id', async (request, reply) => {
    const { orgId } = authOf(request)
    const { id } = request.params as { id: string }
    const { rows } = await db.query('SELECT * FROM runs WHERE org_id = $1 AND id = $2', [orgId, id])
    if (rows.length === 0) {
      return reply.code(404).send({ error: `Run "${id}" not found.` })
    }
    return { run: rows[0] }
  })

  app.get('/v1/runs/:id/events', async (request) => {
    const { orgId } = authOf(request)
    const { id } = request.params as { id: string }
    const query = request.query as { since?: string; limit?: string }

    const { rows } = await db.query(
      `SELECT e.title, e.message, e.icon, e.level, e.kind, e.source, e.group_id, e.ts
       FROM run_events e JOIN runs r ON r.id = e.run_id
       WHERE r.org_id = $1 AND e.run_id = $2 AND e.ts >= $3
       ORDER BY e.ts ASC, e.id ASC LIMIT $4`,
      [
        orgId,
        id,
        Number.parseInt(query.since ?? '0', 10) || 0,
        Math.min(Number.parseInt(query.limit ?? '500', 10) || 500, 2000),
      ]
    )
    return { events: rows }
  })

  /** Queue a manual dispatch for the runner to pick up on its next poll. */
  app.post('/v1/runs', async (request, reply) => {
    const { orgId } = authOf(request)
    const body = request.body as { event?: unknown }
    if (!body.event) {
      return reply.code(400).send({ error: 'event is required.' })
    }
    const id = newId('cmd')
    await db.query(
      `INSERT INTO runner_commands (id, org_id, type, payload) VALUES ($1,$2,'run',$3)`,
      [id, orgId, JSON.stringify({ event: body.event })]
    )
    return reply.code(202).send({ queued: id })
  })

  app.post('/v1/runs/:id/cancel', async (request, reply) => {
    const { orgId } = authOf(request)
    const { id } = request.params as { id: string }
    const commandId = newId('cmd')
    await db.query(
      `INSERT INTO runner_commands (id, org_id, type, payload) VALUES ($1,$2,'cancel',$3)`,
      [commandId, orgId, JSON.stringify({ runId: id })]
    )
    return reply.code(202).send({ queued: commandId })
  })

  app.post('/v1/resync', async (request, reply) => {
    const { orgId } = authOf(request)
    const commandId = newId('cmd')
    await db.query(
      `INSERT INTO runner_commands (id, org_id, type, payload) VALUES ($1,$2,'resync','{}'::jsonb)`,
      [commandId, orgId]
    )
    return reply.code(202).send({ queued: commandId })
  })

  // ── Slack ──────────────────────────────────────────────────

  app.get('/v1/integrations/slack', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query(
      'SELECT enabled, events, created_at FROM slack_integrations WHERE org_id = $1',
      [orgId]
    )
    // The webhook URL is a credential: report that one is configured, never what.
    return { configured: rows.length > 0, ...(rows[0] ?? {}) }
  })

  app.put('/v1/integrations/slack', async (request, reply) => {
    const { orgId } = authOf(request)
    const body = request.body as { webhookUrl?: string; events?: string[]; enabled?: boolean }

    if (!body.webhookUrl?.startsWith('https://hooks.slack.com/')) {
      return reply
        .code(400)
        .send({ error: 'webhookUrl must be a https://hooks.slack.com/ incoming webhook URL.' })
    }

    await db.query(
      `INSERT INTO slack_integrations (org_id, webhook_url, enabled)
       VALUES ($1,$2,$3)
       ON CONFLICT (org_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url,
                                          enabled = EXCLUDED.enabled`,
      [orgId, body.webhookUrl, body.enabled !== false]
    )
    if (body.events?.length) {
      await db.query('UPDATE slack_integrations SET events = $2 WHERE org_id = $1', [
        orgId,
        body.events,
      ])
    }
    return { ok: true }
  })

  app.delete('/v1/integrations/slack', async (request) => {
    const { orgId } = authOf(request)
    await db.query('DELETE FROM slack_integrations WHERE org_id = $1', [orgId])
    return { ok: true }
  })

  // ── API keys ───────────────────────────────────────────────

  app.get('/v1/keys', async (request) => {
    const { orgId } = authOf(request)
    const { rows } = await db.query(
      `SELECT id, name, scope, prefix, created_at, last_used_at, revoked_at
       FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId]
    )
    return { keys: rows }
  })

  /** Mints a key. This is the only time the plaintext is ever available. */
  app.post('/v1/keys', async (request, reply) => {
    const { orgId } = authOf(request)
    const body = request.body as { name?: string; scope?: string }

    if (body.scope !== 'runner' && body.scope !== 'user') {
      return reply.code(400).send({ error: 'scope must be "runner" or "user".' })
    }

    const { key, hash, prefix } = generateKey(body.scope)
    const id = newId('key')
    await db.query(
      'INSERT INTO api_keys (id, org_id, name, scope, key_hash, prefix) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, orgId, body.name ?? body.scope, body.scope, hash, prefix]
    )
    return reply.code(201).send({ id, key, scope: body.scope, prefix })
  })

  app.delete('/v1/keys/:id', async (request) => {
    const { orgId } = authOf(request)
    const { id } = request.params as { id: string }
    await db.query(
      'UPDATE api_keys SET revoked_at = now() WHERE org_id = $1 AND id = $2 AND revoked_at IS NULL',
      [orgId, id]
    )
    return { ok: true }
  })
}

function validateRoute(route: RoutingRule): string | undefined {
  if (!route || typeof route !== 'object') {
    return 'A route object is required.'
  }
  if (!route.name) {
    return 'name is required.'
  }
  if (!route.trigger?.type) {
    return 'trigger.type is required.'
  }
  if (!route.trigger?.projectId) {
    return 'trigger.projectId is required.'
  }
  if (!route.target?.agentRef) {
    return 'target.agentRef is required.'
  }
  if (!route.target.agentRef.profile && !route.target.agentRef.githubLogin) {
    return 'target.agentRef needs either a profile or a githubLogin.'
  }
  if (!route.execution?.promptTemplate) {
    return 'execution.promptTemplate is required.'
  }
  if (typeof route.execution.timeoutSeconds !== 'number') {
    return 'execution.timeoutSeconds must be a number.'
  }
  return undefined
}
