import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudClient } from '../../src/cloud/client.js'

const config = {
  baseUrl: 'https://cloud.example',
  apiKey: 'prx_rnr_test',
  runnerName: 'cerebro',
}

let calls: Array<{ url: string; init: RequestInit }> = []

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CloudClient.heartbeat', () => {
  const health = {
    startedAt: '2026-09-01T00:00:00.000Z',
    hermesOk: true,
    hermesDetail: 'hermes-4-70b',
    activeRuns: 2,
    lastError: null,
  }

  it('posts the runner name alongside its health', async () => {
    await new CloudClient(config).heartbeat(health)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://cloud.example/v1/runner/heartbeat')
    expect(calls[0].init.method).toBe('POST')
    // The name is what the server keys the row on; without it the heartbeat
    // cannot be attributed and is rejected.
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: 'cerebro', ...health })
  })

  it('authenticates as the runner', async () => {
    await new CloudClient(config).heartbeat(health)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer prx_rnr_test')
    expect(headers['content-type']).toBe('application/json')
  })

  /**
   * A 204 is the normal response. Treating an empty body as a parse failure
   * would make every successful heartbeat look like an outage, and the runner
   * would report a permanent failure it does not have.
   */
  it('treats an empty 204 as success', async () => {
    await expect(new CloudClient(config).heartbeat(health)).resolves.toBeUndefined()
  })

  it('rejects when the cloud is unreachable, so the caller can report it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    await expect(new CloudClient(config).heartbeat(health)).rejects.toThrow()
  })

  it('carries the last cycle error when there was one', async () => {
    await new CloudClient(config).heartbeat({ ...health, hermesOk: false, lastError: 'boom' })
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.hermesOk).toBe(false)
    expect(body.lastError).toBe('boom')
  })
})
