import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Database } from './db.js'

export type KeyScope = 'runner' | 'user'

export interface AuthContext {
  orgId: string
  keyId: string
  scope: KeyScope
}

const PREFIXES: Record<KeyScope, string> = {
  runner: 'snt_rnr_',
  user: 'snt_usr_',
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Mints a key. The plaintext is returned exactly once and never stored.
 *
 * The scope is encoded in the visible prefix as well as the row, so an operator
 * looking at a key in a config file can tell what it is without a lookup.
 */
export function generateKey(scope: KeyScope): { key: string; hash: string; prefix: string } {
  const key = `${PREFIXES[scope]}${randomBytes(24).toString('hex')}`
  return { key, hash: hashKey(key), prefix: key.slice(0, 16) }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function parseBearer(header: string | undefined): string | undefined {
  if (!header) {
    return undefined
  }
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : undefined
}

interface KeyRow {
  id: string
  org_id: string
  scope: KeyScope
  revoked_at: Date | null
}

/**
 * Resolves a bearer token to an org and scope.
 *
 * The lookup is by hash, so a timing difference on the hash comparison cannot
 * leak key material; the constant-time compare below guards the one place a
 * caller-supplied value is compared directly.
 */
export async function authenticate(
  db: Database,
  token: string | undefined,
  required: KeyScope
): Promise<AuthContext | undefined> {
  if (!token) {
    return undefined
  }

  const hash = hashKey(token)
  const { rows } = await db.query<KeyRow>(
    'SELECT id, org_id, scope, revoked_at FROM api_keys WHERE key_hash = $1',
    [hash]
  )

  const row = rows[0]
  if (!row || row.revoked_at) {
    return undefined
  }

  // A runner key must never reach a user route, or vice versa: scopes are the
  // only thing separating an unattended daemon's credential from a human's.
  if (!scopeMatches(row.scope, required)) {
    return undefined
  }

  // Fire-and-forget: last_used_at is diagnostics, not a reason to fail a request.
  void db
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id])
    .catch(() => undefined)

  return { orgId: row.org_id, keyId: row.id, scope: row.scope }
}

function scopeMatches(actual: KeyScope, required: KeyScope): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(required)
  return a.length === b.length && timingSafeEqual(a, b)
}
