import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// config.ts reads window at module load, so the API URL has to be in place
// before the module under test is imported.
beforeEach(() => {
  vi.resetModules()
  ;(window as unknown as { __SENTINEL0__?: unknown }).__SENTINEL0__ = {
    apiUrl: 'https://api.example.com/',
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function load() {
  return import('../src/api/client.js')
}

describe('API_URL', () => {
  it('strips a trailing slash so paths never double up', async () => {
    const { API_URL } = await import('../src/config.js')
    expect(API_URL).toBe('https://api.example.com')
  })
})

describe('request', () => {
  it('sends the key as a bearer token and unwraps JSON', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: 1 }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { request } = await load()
    await expect(request('snt_usr_abc', '/v1/me')).resolves.toEqual({ ok: 1 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/me')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer snt_usr_abc')
    // No body, so no Content-Type: some proxies reject one on a bodyless GET.
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('sets Content-Type only when there is a body', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('{}', { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { request } = await load()
    await request('k', '/v1/routes', { method: 'POST', body: { name: 'x' } })

    const [, init] = fetchMock.mock.calls[0]
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init?.body).toBe('{"name":"x"}')
  })

  it('marks a 401 as unauthorized so the session can end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 401 }))
    )

    const { ApiError, request } = await load()
    const error = await request('k', '/v1/me').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as InstanceType<typeof ApiError>).unauthorized).toBe(true)
    expect((error as Error).message).toBe('nope')
  })

  it('does not mark other failures as unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'bad route' }), { status: 400 }))
    )

    const { ApiError, request } = await load()
    const error = await request('k', '/v1/routes').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as InstanceType<typeof ApiError>).unauthorized).toBe(false)
    expect((error as InstanceType<typeof ApiError>).status).toBe(400)
  })

  // Fastify's error handler always sends JSON, but a proxy or a gateway in
  // front of it may not — an HTML 502 must not surface as a parse error.
  it('falls back to the status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 }))
    )

    const { request } = await load()
    await expect(request('k', '/v1/runs')).rejects.toThrow('The API returned 502.')
  })

  it('reports an unreachable API by name rather than "failed to fetch"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    const { request } = await load()
    await expect(request('k', '/v1/me')).rejects.toThrow(
      'Could not reach the API at https://api.example.com.'
    )
  })

  it('lets an abort propagate untouched, so a cancelled load is not an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError')
      })
    )

    const { ApiError, request } = await load()
    const error = await request('k', '/v1/me').catch((cause: unknown) => cause)
    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as DOMException).name).toBe('AbortError')
  })

  it('treats 204 as an empty result rather than a parse failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 }))
    )

    const { request } = await load()
    await expect(request('k', '/v1/keys/x')).resolves.toBeUndefined()
  })
})
