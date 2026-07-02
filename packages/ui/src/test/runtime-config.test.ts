import { afterEach, describe, expect, it } from 'vitest'
import { getRequiredApiBase } from '@/lib/runtime-config'

describe('runtime API configuration', () => {
  afterEach(() => {
    delete window.__PARALLAX_RUNTIME_CONFIG__
  })

  it('uses the dashboard hostname with the injected API port', () => {
    window.__PARALLAX_RUNTIME_CONFIG__ = { apiPort: 9371 }
    expect(getRequiredApiBase()).toBe(`${window.location.protocol}//${window.location.hostname}:9371`)
  })

  it('keeps supporting an explicit API base', () => {
    window.__PARALLAX_RUNTIME_CONFIG__ = { apiBase: 'http://localhost:4000' }
    expect(getRequiredApiBase()).toBe('http://localhost:4000')
  })
})
