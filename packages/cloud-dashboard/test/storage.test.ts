import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearStoredKey, readStoredKey, writeStoredKey } from '../src/lib/storage.js'

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('stored key', () => {
  it('round-trips through localStorage', () => {
    expect(readStoredKey()).toBeUndefined()
    writeStoredKey('snt_usr_abc')
    expect(readStoredKey()).toBe('snt_usr_abc')
    clearStoredKey()
    expect(readStoredKey()).toBeUndefined()
  })

  // Safari in private mode throws on access rather than returning null. A
  // dashboard that white-screens over that is worse than one that re-asks.
  it('survives storage that throws on every access', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
      removeItem() {
        throw new Error('denied')
      },
    })

    expect(() => writeStoredKey('snt_usr_abc')).not.toThrow()
    expect(readStoredKey()).toBeUndefined()
    expect(() => clearStoredKey()).not.toThrow()
  })
})
