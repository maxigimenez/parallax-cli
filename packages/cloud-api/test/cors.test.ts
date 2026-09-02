import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import type { Database } from '../src/db.js'

beforeAll(() => {
  process.env.LOG_LEVEL = 'silent'
})

function fakeDb(): Database {
  return { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as unknown as Database
}

/**
 * The preflight, which is the only place this can be caught.
 *
 * @fastify/cors defaults `methods` to `GET,HEAD,POST`. Every mutating endpoint
 * the dashboard uses beyond POST — deleting a route, removing a project,
 * revoking a key, saving Slack, editing a route — was refused by the browser
 * before it left the page, while curl, which sends no preflight, worked
 * perfectly. Nothing on the server side notices, because the request never
 * arrives.
 */
describe('CORS preflight', () => {
  it('allows every method the user API exposes', async () => {
    const app = await buildApp(fakeDb())

    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/routes/rt_1',
        headers: {
          origin: 'https://dashboard.example',
          'access-control-request-method': method,
        },
      })

      const allowed = String(response.headers['access-control-allow-methods'] ?? '')
        .split(',')
        .map((entry) => entry.trim())

      expect(allowed, `${method} must survive a browser preflight`).toContain(method)
    }
    await app.close()
  })

  it('reflects the requesting origin', async () => {
    const app = await buildApp(fakeDb())
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/runs',
      headers: {
        origin: 'https://dashboard.example',
        'access-control-request-method': 'GET',
      },
    })
    expect(response.headers['access-control-allow-origin']).toBe('https://dashboard.example')
    await app.close()
  })
})
