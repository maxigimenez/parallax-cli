import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import type { AgentDescriptor, AppConfig, RoutingRule, RunStatus } from '@parallax/common'
import type { ParallaxDatabase } from '../database.js'
import { readRunnerErrors } from './diagnostics.js'
import { isAllowedBrowserOrigin } from './network-access.js'

export interface ApiServerDeps {
  getConfig: () => AppConfig
  getAgents: () => AgentDescriptor[]
  getRoutes: () => RoutingRule[]
  reload: () => Promise<AppConfig>
  cancelRun: (runId: string) => Promise<boolean>
  db: ParallaxDatabase
  dataDir: string
}

function parsePositiveInt(raw: unknown, label: string, fallback: number): number {
  if (raw === undefined) {
    return fallback
  }
  const parsed = Number.parseInt(String(raw), 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

/**
 * The runner's local API.
 *
 * Intentionally read-mostly. Configuration lives in the cloud now, so this
 * surface exists for the CLI on the same machine: check health, watch runs,
 * tail logs, cancel something. It is unauthenticated and binds to loopback
 * unless network access is explicitly enabled.
 */
export async function createApiServer(deps: ApiServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  const networkAccess = deps.getConfig().server.networkAccess

  await app.register(cors, {
    delegator: (req, callback) => {
      const origin = req.headers.origin
      callback(null, {
        origin: !origin || isAllowedBrowserOrigin(origin, req.headers.host, networkAccess),
      })
    },
  })

  app.get('/runtime/health', async () => {
    const config = deps.getConfig()
    return {
      status: 'ok',
      version: process.env.PARALLAX_VERSION ?? 'dev',
      projects: config.projects.length,
      agents: deps.getAgents().length,
      routes: deps.getRoutes().length,
      cloud: config.cloud ? 'configured' : 'none',
      hermes: config.hermes?.baseUrl ?? null,
    }
  })

  app.get('/runtime/errors', async () => readRunnerErrors(deps.dataDir))

  app.post('/runtime/reload', async (_request, reply) => {
    try {
      const config = await deps.reload()
      return { ok: true, projects: config.projects.length, routes: deps.getRoutes().length }
    } catch (error: unknown) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get('/agents', async () => ({ agents: deps.getAgents() }))

  app.get('/routes', async () => ({ routes: deps.getRoutes() }))

  app.get('/runs', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>
    try {
      return {
        runs: deps.db.listRuns({
          limit: parsePositiveInt(query.limit, 'limit', 100),
          projectId: query.projectId,
          status: query.status as RunStatus | undefined,
        }),
      }
    } catch (error: unknown) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get('/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const run = deps.db.getRun(runId)
    if (!run) {
      return reply.code(404).send({ error: `Run "${runId}" not found.` })
    }
    return { run }
  })

  app.get('/runs/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const query = request.query as Record<string, string | undefined>

    if (!deps.db.getRun(runId)) {
      return reply.code(404).send({ error: `Run "${runId}" not found.` })
    }
    try {
      return {
        events: deps.db.listRunEvents(runId, {
          since: query.since ? Number.parseInt(query.since, 10) : undefined,
          limit: parsePositiveInt(query.limit, 'limit', 500),
        }),
      }
    } catch (error: unknown) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post('/runs/:runId/cancel', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const canceled = await deps.cancelRun(runId)
    if (!canceled) {
      return reply.code(404).send({ error: `Run "${runId}" not found.` })
    }
    return { ok: true, runId }
  })

  return app
}
