/**
 * Thin HTTP helpers for talking to the local runner and the cloud API.
 *
 * Kept deliberately small: every CLI command that reads state goes through one
 * of these so error messages stay consistent and a stopped runner produces a
 * useful sentence instead of a stack trace.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: string }
    return body.error ?? text
  } catch {
    return text || response.statusText
  }
}

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  } catch (error: unknown) {
    throw new Error(
      `Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response))
  }
  return (await response.json()) as T
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error: unknown) {
    throw new Error(
      `Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response))
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/** Explains a dead runner in terms of what to do about it. */
export function runnerUnreachable(apiBase: string): Error {
  return new Error(
    `The Parallax runner is not responding at ${apiBase}.\n` +
      `Start it with "parallax start", or check "parallax runner status".`
  )
}
