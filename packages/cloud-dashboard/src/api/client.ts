import { API_URL } from '../config.js'

/**
 * A failed request, carrying enough for the UI to react rather than just report.
 *
 * `unauthorized` is separated from every other failure because it is the one
 * the app must handle structurally: the stored key is no longer good, so the
 * session ends. Everything else is shown in place and the session survives.
 */
export class ApiError extends Error {
  readonly status: number
  readonly unauthorized: boolean

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.unauthorized = status === 401
  }
}

export interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

/**
 * One request to the control plane.
 *
 * The key is passed per call rather than held in module state so that the
 * login screen can verify a key it has not adopted yet, and so no code path can
 * accidentally use a key the user has since signed out of.
 */
export async function request<T>(
  key: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (error) {
    // fetch rejects for DNS, TLS, CORS and offline alike, with a message that
    // names none of them. Saying which request died is the useful half.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError(0, `Could not reach the API at ${API_URL || '(not configured)'}.`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string } | undefined)?.error ?? `The API returned ${response.status}.`
    throw new ApiError(response.status, message)
  }

  return payload as T
}

/** Probes a key without adopting it. Used by the login screen. */
export async function verifyKey(key: string, signal?: AbortSignal) {
  return request<import('./types.js').Me>(key, '/v1/me', { signal })
}
