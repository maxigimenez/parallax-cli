import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { hashKey } from '../src/auth.js'
import type { Database } from '../src/db.js'

beforeAll(() => {
  process.env.LOG_LEVEL = 'silent'
})

interface Recorded {
  sql: string
  params: unknown[]
}

/**
 * A database scripted by what the SQL is asking for.
 *
 * Postgres is not available in CI and the interesting behaviour here is the
 * route's own — which shapes it accepts, what it refuses, and what it writes —
 * so the queries are answered by intent rather than executed.
 */
function fakeDb(
  options: {
    agent?: { runner_id: string; runner_name: string; enabled: boolean }
    commands?: Array<Record<string, unknown>>
    runnerId?: string
  } = {}
): Database & { writes: Recorded[] } {
  const writes: Recorded[] = []
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM api_keys')) {
      // The lookup is by hash, so the two known keys are hashed here too --
      // deriving the scope from the hash string would make the runner/user
      // split, which is the thing several of these tests turn on, arbitrary.
      const scope = params[0] === hashKey(RUNNER_KEY) ? 'runner' : 'user'
      return { rows: [{ id: 'key_1', org_id: 'org_1', scope, revoked_at: null }], rowCount: 1 }
    }
    if (sql.includes('FROM agents a JOIN runners r')) {
      return options.agent ? { rows: [options.agent], rowCount: 1 } : { rows: [], rowCount: 0 }
    }
    if (sql.includes('SELECT id FROM runners')) {
      return options.runnerId
        ? { rows: [{ id: options.runnerId }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (sql.includes('FROM runner_commands')) {
      return { rows: options.commands ?? [], rowCount: (options.commands ?? []).length }
    }
    if (!sql.trimStart().toUpperCase().startsWith('SELECT')) {
      writes.push({ sql, params })
    }
    return { rows: [], rowCount: 0 }
  })

  return { query, writes } as unknown as Database & { writes: Recorded[] }
}

const USER_KEY = 'snt_usr_test'
const RUNNER_KEY = 'snt_rnr_test'
const USER = { authorization: `Bearer ${USER_KEY}` }
const RUNNER = { authorization: `Bearer ${RUNNER_KEY}` }

const onCerebro = { runner_id: 'rnr_1', runner_name: 'cerebro', enabled: true }

/** One pending command, so a long poll answers immediately. */
const QUEUED = { cursor: '1', id: 'cmd_1', type: 'run-prompt', payload: {} }

/**
 * Starting one named agent on an operator's own prompt, with no route.
 *
 * The endpoint is shared with the existing "run this ticket now" dispatch, so
 * most of what matters is that the two shapes stay separable and that a request
 * which cannot produce a run is refused here rather than queued into silence.
 */
describe('POST /v1/runs with a prompt', () => {
  it('queues a run-prompt command addressed to the agent’s runner', async () => {
    const db = fakeDb({ agent: onCerebro })
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { runnerId: 'rnr_1', agentProfile: 'product', prompt: 'Audit the billing export' },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({ runner: 'cerebro' })

    const queued = db.writes.find((write) => write.sql.includes('INSERT INTO runner_commands'))!
    expect(queued.sql).toContain("'run-prompt'")
    // Addressed, not broadcast: the profile lives on exactly one machine.
    expect(queued.params[2]).toBe('rnr_1')
    expect(JSON.parse(String(queued.params[3]))).toMatchObject({
      agentProfile: 'product',
      prompt: 'Audit the billing export',
    })
    await app.close()
  })

  it('still accepts the trigger-event shape', async () => {
    const db = fakeDb()
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { event: { projectId: 'acme/platform', ref: 'LIN-1' } },
    })

    expect(response.statusCode).toBe(202)
    expect(db.writes.find((w) => w.sql.includes('runner_commands'))!.sql).toContain("'run'")
    await app.close()
  })

  /**
   * The two shapes answer different questions — "put this through the rules"
   * versus "ask this agent directly". Resolving the ambiguity by precedence
   * would start the wrong agent on the wrong work.
   */
  it('refuses a request that is both shapes at once', async () => {
    const db = fakeDb({ agent: onCerebro })
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { event: { projectId: 'p' }, agentProfile: 'product', prompt: 'hi' },
    })

    expect(response.statusCode).toBe(400)
    expect(db.writes.filter((w) => w.sql.includes('runner_commands'))).toHaveLength(0)
    await app.close()
  })

  it('refuses a blank prompt', async () => {
    const db = fakeDb({ agent: onCerebro })
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { agentProfile: 'product', prompt: '   ' },
    })

    expect(response.statusCode).toBe(400)
    expect(db.writes.filter((w) => w.sql.includes('runner_commands'))).toHaveLength(0)
    await app.close()
  })

  it('caps the prompt rather than writing an unbounded column', async () => {
    const db = fakeDb({ agent: onCerebro })
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { agentProfile: 'product', prompt: 'x'.repeat(20_001) },
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  /**
   * A dashboard left open across an inventory change can offer an agent the
   * runner no longer has. Queueing that command would leave it in the table
   * forever with nothing to answer it, and the person who pressed the button
   * watching a run that never appears.
   */
  it('refuses an agent that is not on the named runner', async () => {
    const db = fakeDb({ agent: undefined })
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { runnerId: 'rnr_1', agentProfile: 'ghost', prompt: 'hello' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('refuses a disabled agent', async () => {
    const db = fakeDb({ agent: { ...onCerebro, enabled: false } })
    const app = await buildApp(db)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: USER,
      payload: { runnerId: 'rnr_1', agentProfile: 'product', prompt: 'hello' },
    })

    expect(response.statusCode).toBe(409)
    await app.close()
  })

  it('is a user route, closed to a runner key', async () => {
    const app = await buildApp(fakeDb({ agent: onCerebro }))

    const response = await app.inject({
      method: 'POST',
      url: '/v1/runs',
      headers: RUNNER,
      payload: { agentProfile: 'product', prompt: 'hello' },
    })

    expect(response.statusCode).toBe(401)
    await app.close()
  })
})

/**
 * Commands are now addressed, so the poll and the ack both have to respect the
 * address. The ack matters as much as the poll: acking by cursor alone marks
 * every org command delivered, which on a two-runner org destroys the other
 * runner's work before it ever fetches it.
 */
describe('runner-addressed command delivery', () => {
  it('fetches this runner’s commands and the unaddressed ones', async () => {
    // Non-empty, so the long poll returns on its first pass rather than
    // holding the connection open for its full window.
    const db = fakeDb({ runnerId: 'rnr_1', commands: [QUEUED] })
    const app = await buildApp(db)

    await app.inject({
      method: 'GET',
      url: '/v1/runner/commands?cursor=0&wait=1&runner=cerebro',
      headers: RUNNER,
    })

    const fetch = (db.query as unknown as { mock: { calls: [string, unknown[]][] } }).mock.calls
      .map(([sql, params]) => ({ sql, params }))
      .find((call) => call.sql.includes('FROM runner_commands'))!

    expect(fetch.sql).toContain('runner_id IS NULL OR runner_id = $3')
    expect(fetch.params[2]).toBe('rnr_1')
    await app.close()
  })

  it('scopes the ack the same way', async () => {
    const db = fakeDb({ runnerId: 'rnr_1' })
    const app = await buildApp(db)

    await app.inject({
      method: 'POST',
      url: '/v1/runner/commands/ack',
      headers: RUNNER,
      payload: { cursor: 12, runner: 'cerebro' },
    })

    const ack = db.writes.find((write) => write.sql.includes('UPDATE runner_commands'))!
    expect(ack.sql).toContain('runner_id IS NULL OR runner_id = $3')
    expect(ack.params).toEqual(['org_1', 12, 'rnr_1'])
    await app.close()
  })

  /**
   * A runner too old to name itself keeps working: it receives every
   * unaddressed command, exactly as before, and claims none addressed to a
   * machine it may not be.
   */
  it('gives an unidentified runner only the unaddressed commands', async () => {
    const db = fakeDb({ commands: [QUEUED] })
    const app = await buildApp(db)

    await app.inject({
      method: 'GET',
      url: '/v1/runner/commands?cursor=0&wait=1',
      headers: RUNNER,
    })

    const fetch = (db.query as unknown as { mock: { calls: [string, unknown[]][] } }).mock.calls
      .map(([sql, params]) => ({ sql, params }))
      .find((call) => call.sql.includes('FROM runner_commands'))!

    expect(fetch.params[2]).toBeNull()
    await app.close()
  })
})
