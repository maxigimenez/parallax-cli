import { describe, expect, it } from 'vitest'
import { parseStartOptions, parseRunOptions, parseRunsOptions } from '../src/args.js'
import { parseRunningState } from '../src/config.js'

describe('parseStartOptions', () => {
  it('defaults to a local-only runner on the standard port', () => {
    expect(parseStartOptions([])).toEqual({
      apiPort: 9371,
      concurrency: 2,
      networkAccess: false,
      foreground: false,
    })
  })

  it('enables network access from a value-less flag', () => {
    expect(parseStartOptions(['--network-access']).networkAccess).toBe(true)
  })

  it('accepts port and concurrency overrides', () => {
    const options = parseStartOptions(['--api-port', '9999', '--concurrency', '4'])
    expect(options).toMatchObject({ apiPort: 9999, concurrency: 4 })
  })

  it('rejects out-of-range values rather than clamping them', () => {
    expect(() => parseStartOptions(['--concurrency', '99'])).toThrow(/between 1 and 16/)
    expect(() => parseStartOptions(['--api-port', '0'])).toThrow(/between 1 and 65535/)
  })

  it('rejects an unknown flag instead of ignoring it', () => {
    expect(() => parseStartOptions(['--ui-port', '9372'])).toThrow(/Unknown flag "--ui-port"/)
  })

  it('rejects a flag given without its value', () => {
    expect(() => parseStartOptions(['--api-port'])).toThrow(/--api-port requires a value/)
  })
})

describe('parseRunOptions', () => {
  it('requires both an agent and a prompt', () => {
    expect(() => parseRunOptions(['--agent', 'product'])).toThrow(/--prompt/)
    expect(() => parseRunOptions(['--prompt', 'hi'])).toThrow(/--agent/)
  })

  it('parses a full invocation with a default timeout', () => {
    expect(parseRunOptions(['--agent', 'product', '--prompt', 'say hello'])).toEqual({
      agent: 'product',
      prompt: 'say hello',
      timeoutSeconds: 600,
    })
  })
})

describe('parseRunsOptions', () => {
  it('defaults the page size and passes a status filter through', () => {
    expect(parseRunsOptions([])).toEqual({ status: undefined, limit: 20 })
    expect(parseRunsOptions(['--status', 'failed']).status).toBe('failed')
  })
})

describe('parseRunningState', () => {
  const manifest = { startedAt: 1, runnerPid: 42, apiPort: 9371 }

  it('treats a manifest with no networkAccess as local-only', () => {
    expect(parseRunningState(JSON.stringify(manifest), 'm')).toEqual({
      startedAt: 1,
      runnerPid: 42,
      apiPort: 9371,
      networkAccess: false,
    })
  })

  it('preserves enabled network access', () => {
    const raw = JSON.stringify({ ...manifest, networkAccess: true })
    expect(parseRunningState(raw, 'm').networkAccess).toBe(true)
  })

  it('rejects a manifest missing the runner pid', () => {
    const raw = JSON.stringify({ startedAt: 1, apiPort: 9371 })
    expect(() => parseRunningState(raw, 'm')).toThrow(/Invalid running manifest/)
  })

  it('rejects malformed json with the source path', () => {
    expect(() => parseRunningState('{ not json', '/tmp/running.json')).toThrow(
      /Invalid running manifest at \/tmp\/running\.json/
    )
  })
})
