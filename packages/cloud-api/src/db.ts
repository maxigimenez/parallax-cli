import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg, { type Pool as PgPool } from 'pg'

const { Pool } = pg

export type Database = PgPool

let pool: Database | undefined

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    // Fail fast rather than starting a server that will 500 on first request.
    throw new Error(`${name} is required.`)
  }
  return value
}

export function getPool(): Database {
  pool ??= new Pool({
    connectionString: requireEnv('DATABASE_URL'),
    // Railway's managed Postgres presents a certificate the default agent will
    // not verify; the connection is still TLS, just unverified.
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
    max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
  })
  return pool
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = undefined
}

function migrationsDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
}

/**
 * Applies pending `.sql` files in filename order, once each.
 *
 * Deliberately plain SQL rather than an ORM's migration tooling: this runs as a
 * Railway release command inside a minimal image, and the fewer build-time
 * codegen steps stand between a schema change and a deploy, the fewer ways a
 * deploy can fail.
 */
export async function migrate(db: Database = getPool()): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)

  const dir = migrationsDir()
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const result = await db.query<{ name: string }>('SELECT name FROM schema_migrations')
  const applied = new Set(result.rows.map((row) => row.name))

  const ran: string[] = []
  for (const file of files) {
    if (applied.has(file)) {
      continue
    }
    const sql = await fs.readFile(path.join(dir, file), 'utf8')
    const client = await db.connect()
    try {
      // One transaction per file, so a failure leaves no partial schema behind.
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      ran.push(file)
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error(
        `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    } finally {
      client.release()
    }
  }

  return ran
}
