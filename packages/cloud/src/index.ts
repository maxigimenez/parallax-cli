import { buildApp } from './app.js'
import { closePool, getPool, migrate } from './db.js'

async function main(): Promise<void> {
  const db = getPool()

  // Idempotent, and cheap when there is nothing to do. Running it here as well
  // as in the release command means a fresh environment works even if someone
  // deploys without configuring one.
  const applied = await migrate(db)
  if (applied.length > 0) {
    console.log(`Applied migrations: ${applied.join(', ')}`)
  }

  const app = await buildApp(db)
  const port = Number.parseInt(process.env.PORT ?? '8080', 10)

  // Railway routes to the container's PORT on all interfaces.
  await app.listen({ port, host: '0.0.0.0' })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} received; shutting down.`)
    await app.close()
    await closePool()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
