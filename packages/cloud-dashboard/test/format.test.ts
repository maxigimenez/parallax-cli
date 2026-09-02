import { describe, expect, it } from 'vitest'
import {
  duration,
  epochMillis,
  formatSeconds,
  initials,
  isTerminal,
  relativeTime,
  STATUS_TONE,
  uptime,
} from '../src/lib/format.js'

describe('duration', () => {
  const started = '2026-09-01T10:00:00.000Z'

  it('measures a finished run between its two timestamps', () => {
    expect(duration(started, '2026-09-01T10:04:12.000Z')).toBe('4m 12s')
  })

  it('measures a running run against now, so it ticks upward', () => {
    const now = Date.parse('2026-09-01T10:00:30.000Z')
    expect(duration(started, null, now)).toBe('30s')
  })

  it('never reports a negative duration when the clocks disagree', () => {
    const now = Date.parse('2026-09-01T09:59:00.000Z')
    expect(duration(started, null, now)).toBe('0s')
  })

  it('reports a dash rather than NaN for missing or unparseable times', () => {
    expect(duration(null, null)).toBe('—')
    expect(duration('not a date', null)).toBe('—')
  })
})

describe('formatSeconds', () => {
  it('pads so a column of times stays aligned', () => {
    expect(formatSeconds(59)).toBe('59s')
    expect(formatSeconds(65)).toBe('1m 05s')
    expect(formatSeconds(3600)).toBe('1h 00m')
    expect(formatSeconds(7860)).toBe('2h 11m')
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-09-01T12:00:00.000Z')

  it('says never for a runner that has not reported', () => {
    expect(relativeTime(null, now)).toBe('never')
  })

  it('collapses a few seconds to "just now"', () => {
    expect(relativeTime('2026-09-01T11:59:58.000Z', now)).toBe('just now')
  })

  // A browser clock behind the server's would otherwise render "-4m ago".
  it('collapses a future timestamp to "just now" rather than going negative', () => {
    expect(relativeTime('2026-09-01T12:04:00.000Z', now)).toBe('just now')
  })

  it('reports elapsed time otherwise', () => {
    expect(relativeTime('2026-09-01T11:55:00.000Z', now)).toBe('5m 00s ago')
  })
})

describe('initials', () => {
  it('takes two letters from a single-word profile', () => {
    expect(initials('product')).toBe('PR')
  })

  it('takes one letter from each of the first two words', () => {
    expect(initials('pr-reviewer')).toBe('PR')
    expect(initials('hermes_alpha')).toBe('HA')
  })

  it('falls back rather than rendering an empty avatar', () => {
    expect(initials('')).toBe('—')
    expect(initials('---')).toBe('—')
  })
})

describe('status', () => {
  it('gives every status a tone, so no badge renders untoned', () => {
    for (const tone of Object.values(STATUS_TONE)) {
      expect(tone).toBeTruthy()
    }
    expect(Object.keys(STATUS_TONE)).toHaveLength(6)
  })

  it('treats only finished runs as terminal', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('canceled')).toBe(true)
    expect(isTerminal('running')).toBe(false)
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('awaiting_approval')).toBe(false)
  })
})

describe('epochMillis', () => {
  // node-postgres returns bigint columns as strings; `new Date(string)` on one
  // is Invalid Date, which would render every event time as a dash.
  it('accepts the string a bigint column arrives as', () => {
    expect(epochMillis('1788294119795')).toBe(1788294119795)
    expect(new Date(epochMillis('1788294119795')!).getTime()).toBe(1788294119795)
  })

  it('accepts a plain number unchanged', () => {
    expect(epochMillis(1788294119795)).toBe(1788294119795)
  })

  it('returns undefined for anything unusable, rather than a bogus date', () => {
    expect(epochMillis(null)).toBeUndefined()
    expect(epochMillis('not a number')).toBeUndefined()
    expect(epochMillis('')).toBe(0)
  })
})

describe('uptime', () => {
  const start = '2026-09-01T00:00:00.000Z'
  const at = (iso: string): number => Date.parse(iso)

  // Coarser than `duration` on purpose: nobody reads a daemon's uptime to the
  // second, and a value that changes every second reads as noise.
  it('coarsens as it grows', () => {
    expect(uptime(start, at('2026-09-01T00:00:42.000Z'))).toBe('42s')
    expect(uptime(start, at('2026-09-01T00:20:00.000Z'))).toBe('20m')
    expect(uptime(start, at('2026-09-01T05:30:00.000Z'))).toBe('5h 30m')
    expect(uptime(start, at('2026-09-04T06:00:00.000Z'))).toBe('3d 6h')
  })

  it('does not go negative when the clocks disagree', () => {
    expect(uptime(start, at('2026-08-31T23:00:00.000Z'))).toBe('0s')
  })

  it('reports a dash for an unparseable timestamp', () => {
    expect(uptime('not a date')).toBe('—')
  })
})
