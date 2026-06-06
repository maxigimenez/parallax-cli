import { afterEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import { parseStartOptions } from '../src/args.js'
import { parseRunningState } from '../src/config.js'
import { buildDashboardUrl, resolveNetworkHostname } from '../src/network.js'

describe('network access CLI behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps network access disabled by default', () => {
    expect(parseStartOptions([]).networkAccess).toBe(false)
  })

  it('enables network access with a value-less flag', () => {
    expect(parseStartOptions(['--network-access']).networkAccess).toBe(true)
    expect(() => parseStartOptions(['--network-access=true'])).toThrow(
      '--network-access does not accept a value.'
    )
  })

  it('loads old manifests as local-only', () => {
    expect(
      parseRunningState(
        JSON.stringify({
          startedAt: 1,
          orchestratorPid: 2,
          apiPort: 9371,
          uiPort: 9372,
        }),
        '/tmp/running.json'
      ).networkAccess
    ).toBe(false)
  })

  it('preserves enabled network access in the running manifest', () => {
    expect(
      parseRunningState(
        JSON.stringify({
          startedAt: 1,
          orchestratorPid: 2,
          apiPort: 9371,
          uiPort: 9372,
          networkAccess: true,
        }),
        '/tmp/running.json'
      ).networkAccess
    ).toBe(true)
  })

  it('formats macOS hostnames and IPv6 dashboard URLs', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    vi.spyOn(os, 'hostname').mockReturnValue('cerebro')
    expect(resolveNetworkHostname()).toBe('cerebro.local')
    expect(buildDashboardUrl('cerebro.local', 9372)).toBe('http://cerebro.local:9372')
    expect(buildDashboardUrl('fe80::1', 9372)).toBe('http://[fe80::1]:9372')
  })
})
