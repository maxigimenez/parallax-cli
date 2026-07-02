import { describe, expect, it, vi } from 'vitest'
import { allowSocketRequest, isAllowedBrowserOrigin } from '../src/runtime/network-access.js'

describe('network access origin policy', () => {
  it('allows only loopback origins in local mode', () => {
    expect(isAllowedBrowserOrigin('http://localhost:9372', 'localhost:9371', false)).toBe(true)
    expect(isAllowedBrowserOrigin('http://127.0.0.1:9372', '127.0.0.1:9371', false)).toBe(true)
    expect(isAllowedBrowserOrigin('http://cerebro.local:9372', 'cerebro.local:9371', false)).toBe(
      false
    )
  })

  it('allows same-host HTTP origins in network mode', () => {
    expect(isAllowedBrowserOrigin('http://cerebro.local:9372', 'cerebro.local:9371', true)).toBe(
      true
    )
    expect(isAllowedBrowserOrigin('http://192.168.1.20:9372', '192.168.1.20:9371', true)).toBe(true)
    expect(isAllowedBrowserOrigin('http://other.local:9372', 'cerebro.local:9371', true)).toBe(
      false
    )
    expect(isAllowedBrowserOrigin('https://cerebro.local:9372', 'cerebro.local:9371', true)).toBe(
      false
    )
  })

  it('uses the same policy for Socket.IO requests', () => {
    const callback = vi.fn()
    allowSocketRequest(true)(
      {
        headers: {
          origin: 'http://cerebro.local:9372',
          host: 'cerebro.local:9371',
        },
      } as any,
      callback
    )
    expect(callback).toHaveBeenCalledWith(null, true)
  })
})
