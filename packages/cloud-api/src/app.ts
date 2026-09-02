import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import type { Database } from './db.js'
import { registerRunnerRoutes } from './routes/runner.js'
import { registerUserRoutes } from './routes/user.js'

export async function buildApp(db: Database): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

  // The dashboard is a separate origin, so CORS is on for the user API. Runner
  // traffic is server-to-server and unaffected by it either way.
  //
  // `methods` is not optional here. @fastify/cors defaults to `GET,HEAD,POST`,
  // so a browser's preflight refuses PUT, PATCH and DELETE — which silently
  // broke every delete button and the Slack save in the dashboard, while curl,
  // which sends no preflight, worked perfectly. The list mirrors what the user
  // API actually exposes.
  await app.register(cors, {
    origin: process.env.CORS_ORIGINS?.split(',') ?? true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // Unauthenticated on purpose: Railway's health check runs before any key exists.
  app.get('/health', async () => {
    await db.query('SELECT 1')
    return { status: 'ok', version: process.env.npm_package_version ?? 'dev' }
  })

  registerRunnerRoutes(app, db)
  registerUserRoutes(app, db)

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    app.log.error(error)
    reply.code(error.statusCode ?? 500).send({ error: error.message })
  })

  return app
}
