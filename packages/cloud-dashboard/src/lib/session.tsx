import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { verifyKey } from '../api/client.js'
import type { Me } from '../api/types.js'
import { clearStoredKey, readStoredKey, writeStoredKey } from './storage.js'

interface Session {
  key: string
  me: Me
}

interface SessionValue {
  session: Session | undefined
  /** True only while a stored key is being re-verified on first load. */
  restoring: boolean
  signIn: (key: string, me: Me) => void
  signOut: () => void
}

const SessionContext = createContext<SessionValue | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [restoring, setRestoring] = useState(true)

  // A key in storage is a claim, not proof. It may have been revoked since the
  // last visit, so it is re-verified before the app renders as signed in —
  // otherwise the first screen would load, flash data-less panels, and then
  // bounce to login on the first 401.
  useEffect(() => {
    const stored = readStoredKey()
    if (!stored) {
      setRestoring(false)
      return
    }
    const controller = new AbortController()
    verifyKey(stored, controller.signal)
      .then((me) => setSession({ key: stored, me }))
      .catch(() => clearStoredKey())
      .finally(() => setRestoring(false))
    return () => controller.abort()
  }, [])

  const signIn = useCallback((key: string, me: Me) => {
    writeStoredKey(key)
    setSession({ key, me })
  }, [])

  const signOut = useCallback(() => {
    clearStoredKey()
    setSession(undefined)
  }, [])

  const value = useMemo(
    () => ({ session, restoring, signIn, signOut }),
    [session, restoring, signIn, signOut]
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider.')
  }
  return value
}

/** The signed-in key. Throws if called outside an authenticated screen. */
export function useKey(): string {
  const { session } = useSession()
  if (!session) {
    throw new Error('useKey must be used inside an authenticated screen.')
  }
  return session.key
}
