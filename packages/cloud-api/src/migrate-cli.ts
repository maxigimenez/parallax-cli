import { closePool, migrate } from './db.js'

migrate()
  .then(async (applied) => {
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations.')
    await closePool()
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error)
    await closePool()
    process.exit(1)
  })
