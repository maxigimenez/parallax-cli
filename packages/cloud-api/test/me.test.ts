import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { hashKey } from '../src/auth.js'
import type { Database } from '../src/db.js'

// buildApp logs every request at info; a route test that prints twelve lines of
// JSON per assertion buries the actual failure.
beforeAll(() => {
  process.env.LOG_LEVEL = 'silent'
})

const USER_KEY = 'prx_usr_dashboard'
const RUNNER_KEY = 'prx_rnr_daemon'

/**
 * Answers the two queries `/v1/me` makes, keyed on the SQL rather than the
 * call order, so the test does not break when an unrelated query is added.
 */
function fakeDb(): Database {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM api_keys WHERE key_hash')) {
        const rows =
          params[0] === hashKey(USER_KEY)
            ? [{ id: 'key_u', org_id: 'org_1', scope: 'user', revoked_at: null }]
            : params[0] === hashKey(RUNNER_KEY)
              ? [{ id: 'key_r', org_id: 'org_1', scope: 'runner', revoked_at: null }]
              : []
        return { rows, rowCount: rows.length }
      }
      if (sql.includes('FROM organizations o')) {
        return {
          rows: [
            {
              id: 'org_1',
              name: 'Parallax Labs',
              created_at: '2026-08-01T00:00:00.000Z',
              key_name: 'dashboard',
              key_prefix: 'prx_usr_dashboa',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    }),
  } as unknown as Database
}

describe('GET /v1/me', () => {
  it('names the organization behind a user key', async () => {
    const app = await buildApp(fakeDb())
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${USER_KEY}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      org: { id: 'org_1', name: 'Parallax Labs', createdAt: '2026-08-01T00:00:00.000Z' },
      key: { id: 'key_u', name: 'dashboard', prefix: 'prx_usr_dashboa', scope: 'user' },
    })
    await app.close()
  })

  // The dashboard's whole sign-in is this endpoint, so the scope boundary has
  // to hold here as firmly as on any mutating route.
  it('refuses a runner key', async () => {
    const app = await buildApp(fakeDb())
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${RUNNER_KEY}` },
    })
    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it('refuses an unknown key and a missing header alike', async () => {
    const app = await buildApp(fakeDb())
    for (const headers of [{ authorization: 'Bearer nope' }, {}]) {
      const response = await app.inject({ method: 'GET', url: '/v1/me', headers })
      expect(response.statusCode).toBe(401)
    }
    await app.close()
  })

  // The key is valid, so the caller is authenticated; a missing row is a data
  // problem, not an auth one, and signing them out over it would be wrong.
  it('falls back to the org id when the join finds no row', async () => {
    const db = fakeDb()
    const original = db.query as unknown as (sql: string, params?: unknown[]) => Promise<unknown>
    ;(db as { query: unknown }).query = async (sql: string, params?: unknown[]) =>
      sql.includes('FROM organizations o')
        ? { rows: [], rowCount: 0 }
        : await original(sql, params ?? [])

    const app = await buildApp(db)
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${USER_KEY}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().org).toEqual({ id: 'org_1', name: 'org_1', createdAt: null })
    await app.close()
  })
})
