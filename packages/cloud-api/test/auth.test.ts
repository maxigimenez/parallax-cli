import { describe, expect, it, vi } from 'vitest'
import { authenticate, generateKey, hashKey, newId, parseBearer } from '../src/auth.js'
import type { Database } from '../src/db.js'

function fakeDb(rows: Array<Record<string, unknown>>): Database & { queries: string[] } {
  const queries: string[] = []
  return {
    queries,
    query: vi.fn(async (sql: string) => {
      queries.push(sql)
      return sql.startsWith('SELECT') ? { rows, rowCount: rows.length } : { rows: [], rowCount: 0 }
    }),
  } as unknown as Database & { queries: string[] }
}

describe('generateKey', () => {
  it('encodes the scope in the visible prefix', () => {
    expect(generateKey('runner').key).toMatch(/^snt_rnr_[0-9a-f]{48}$/)
    expect(generateKey('user').key).toMatch(/^snt_usr_[0-9a-f]{48}$/)
  })

  it('returns a hash that matches the key and never the key itself', () => {
    const { key, hash, prefix } = generateKey('user')
    expect(hash).toBe(hashKey(key))
    expect(hash).not.toContain(key)
    expect(key.startsWith(prefix)).toBe(true)
  })

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateKey('user').key))
    expect(keys.size).toBe(50)
  })
})

describe('parseBearer', () => {
  it('extracts the token', () => {
    expect(parseBearer('Bearer abc123')).toBe('abc123')
    expect(parseBearer('bearer abc123')).toBe('abc123')
  })

  it('returns undefined for anything else', () => {
    expect(parseBearer(undefined)).toBeUndefined()
    expect(parseBearer('')).toBeUndefined()
    expect(parseBearer('Basic abc')).toBeUndefined()
    expect(parseBearer('abc123')).toBeUndefined()
  })
})

describe('authenticate', () => {
  const activeRunnerKey = { id: 'key_1', org_id: 'org_1', scope: 'runner', revoked_at: null }

  it('resolves a valid key of the required scope', async () => {
    const db = fakeDb([activeRunnerKey])
    await expect(authenticate(db, 'snt_rnr_x', 'runner')).resolves.toEqual({
      orgId: 'org_1',
      keyId: 'key_1',
      scope: 'runner',
    })
  })

  it('rejects a runner key presented to a user route, and the reverse', async () => {
    await expect(authenticate(fakeDb([activeRunnerKey]), 'k', 'user')).resolves.toBeUndefined()

    const userKey = { ...activeRunnerKey, scope: 'user' }
    await expect(authenticate(fakeDb([userKey]), 'k', 'runner')).resolves.toBeUndefined()
  })

  it('rejects a revoked key', async () => {
    const db = fakeDb([{ ...activeRunnerKey, revoked_at: new Date() }])
    await expect(authenticate(db, 'k', 'runner')).resolves.toBeUndefined()
  })

  it('rejects an unknown key and a missing token', async () => {
    await expect(authenticate(fakeDb([]), 'nope', 'runner')).resolves.toBeUndefined()
    await expect(
      authenticate(fakeDb([activeRunnerKey]), undefined, 'runner')
    ).resolves.toBeUndefined()
  })

  it('looks the key up by hash, never by the raw value', async () => {
    const db = fakeDb([activeRunnerKey])
    await authenticate(db, 'snt_rnr_secret', 'runner')

    const call = (db.query as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    expect(String(call[0])).toContain('key_hash = $1')
    expect((call[1] as string[])[0]).toBe(hashKey('snt_rnr_secret'))
    expect((call[1] as string[])[0]).not.toBe('snt_rnr_secret')
  })
})

describe('newId', () => {
  it('prefixes and stays url-safe', () => {
    expect(newId('org')).toMatch(/^org_[0-9a-f]{20}$/)
  })
})
