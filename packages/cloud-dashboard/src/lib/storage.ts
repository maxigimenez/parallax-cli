/**
 * The stored session.
 *
 * v1 keeps the user key in localStorage. That is a deliberate, bounded choice:
 * the key is the whole credential, so anything with script access to this
 * origin has it, and it survives until explicitly signed out. It is acceptable
 * here because the same key is already pasted into config files on operator
 * machines, and the dashboard is not yet multi-user. A server-side session with
 * an httpOnly cookie is the upgrade, and it belongs with real accounts.
 *
 * Every access is wrapped: Safari's private mode throws on access rather than
 * returning null, and a dashboard that white-screens because storage is
 * disabled would be a worse failure than one that simply asks for the key
 * again.
 */
const KEY_STORAGE = 'parallax.userKey'

export function readStoredKey(): string | undefined {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? undefined
  } catch {
    return undefined
  }
}

export function writeStoredKey(key: string): void {
  try {
    window.localStorage.setItem(KEY_STORAGE, key)
  } catch {
    // Storage unavailable: the session still works, it just will not survive a
    // reload. Failing the sign-in over that would be worse.
  }
}

export function clearStoredKey(): void {
  try {
    window.localStorage.removeItem(KEY_STORAGE)
  } catch {}
}
