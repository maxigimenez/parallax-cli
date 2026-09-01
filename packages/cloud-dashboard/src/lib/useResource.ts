import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import { useSession } from './session.js'

export interface Resource<T> {
  data: T | undefined
  error: string | undefined
  /** True on the first load only, so a refresh does not blank the screen. */
  loading: boolean
  /** True while any fetch is in flight, including a background refresh. */
  refreshing: boolean
  reload: () => void
}

/**
 * Loads one thing from the API and keeps it fresh.
 *
 * Two behaviours matter more than the fetching:
 *
 * `loading` is true only before the first result. A poll or a manual refresh
 * sets `refreshing` instead, so a screen that already has data keeps showing it
 * rather than collapsing to a spinner every few seconds.
 *
 * A 401 ends the session rather than being rendered. The key was revoked or
 * rotated, and every other panel is about to fail the same way; showing six
 * copies of the same error instead of returning to the login screen would be
 * both noisier and wrong.
 */
export function useResource<T>(
  load: (key: string, signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { pollMs?: number } = {}
): Resource<T> {
  const { session, signOut } = useSession()
  const key = session?.key
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0)

  // Held in a ref so changing the callback identity every render — which it
  // does, because callers pass an inline arrow — does not restart the effect.
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!key) {
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setRefreshing(true)

    loadRef
      .current(key, controller.signal)
      .then((result) => {
        if (cancelled) {
          return
        }
        setData(result)
        setError(undefined)
      })
      .catch((cause: unknown) => {
        if (cancelled || (cause instanceof DOMException && cause.name === 'AbortError')) {
          return
        }
        if (cause instanceof ApiError && cause.unauthorized) {
          signOut()
          return
        }
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // The caller's `deps` are spread in deliberately: this hook's contract is
    // that it refetches when they change, and the loader itself is held in a
    // ref precisely so its unstable identity is not part of that decision.
  }, [key, tick, signOut, ...deps])

  const pollMs = options.pollMs
  useEffect(() => {
    if (!pollMs) {
      return
    }
    const timer = setInterval(reload, pollMs)
    return () => clearInterval(timer)
  }, [pollMs, reload])

  return { data, error, loading, refreshing, reload }
}
