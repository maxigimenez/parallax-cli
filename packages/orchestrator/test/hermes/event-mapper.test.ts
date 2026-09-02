import { describe, expect, it } from 'vitest'
import { RUN_LOG_KIND, RUN_LOG_LEVEL, RUN_LOG_SOURCE } from '@parallax/common'
import { extractText, mapHermesEvent } from '../../src/hermes/event-mapper.js'

const NOW = 1_700_000_000_000

describe('extractText', () => {
  it('reads plain strings and arrays', () => {
    expect(extractText('hello')).toBe('hello')
    expect(extractText(['a', 'b'])).toBe('ab')
  })

  it('unwraps the several shapes Hermes nests text in', () => {
    expect(extractText({ text: 'a' })).toBe('a')
    expect(extractText({ delta: 'b' })).toBe('b')
    expect(extractText({ content: [{ type: 'output_text', text: 'c' }] })).toBe('c')
    expect(extractText({ message: { content: 'd' } })).toBe('d')
  })

  it('returns an empty string for things with no text in them', () => {
    expect(extractText(undefined)).toBe('')
    expect(extractText(42)).toBe('')
    expect(extractText({ unrelated: true })).toBe('')
  })
})

describe('mapHermesEvent', () => {
  it('maps a tool start to a COMMAND entry carrying the call id as group', () => {
    const entry = mapHermesEvent(
      { event: 'tool.started', data: { name: 'terminal', arguments: 'ls -la', call_id: 'call_1' } },
      NOW
    )
    expect(entry).toMatchObject({
      title: 'terminal',
      message: 'ls -la',
      kind: RUN_LOG_KIND.COMMAND,
      groupId: 'call_1',
      timestamp: NOW,
    })
  })

  it('marks tool completion distinctly from tool start', () => {
    const started = mapHermesEvent({ event: 'tool.started', data: { name: 'terminal' } }, NOW)
    const done = mapHermesEvent({ event: 'tool.completed', data: { name: 'terminal' } }, NOW)
    expect(started?.message).toBe('started')
    expect(done?.message).toBe('completed')
    expect(done?.icon).not.toBe(started?.icon)
  })

  it('drops empty progress pings that would otherwise flood the log', () => {
    expect(mapHermesEvent({ event: 'hermes.tool.progress', data: {} }, NOW)).toBeNull()
  })

  it('keeps a progress event that actually carries output', () => {
    const entry = mapHermesEvent(
      { event: 'hermes.tool.progress', data: { name: 'terminal', output: 'building...' } },
      NOW
    )
    expect(entry?.message).toBe('building...')
  })

  it('maps subagent lifecycle', () => {
    const entry = mapHermesEvent({ event: 'subagent.start', data: { name: 'researcher' } }, NOW)
    expect(entry).toMatchObject({ kind: RUN_LOG_KIND.SUBAGENT, title: 'researcher' })
  })

  it('maps assistant deltas to agent messages and drops blank ones', () => {
    expect(mapHermesEvent({ event: 'assistant.delta', data: { delta: 'hi' } }, NOW)).toMatchObject({
      kind: RUN_LOG_KIND.AGENT_MESSAGE,
      message: 'hi',
    })
    expect(mapHermesEvent({ event: 'assistant.delta', data: { delta: '   ' } }, NOW)).toBeNull()
  })

  it('maps reasoning separately from assistant output', () => {
    const entry = mapHermesEvent({ event: 'response.thinking', data: { text: 'considering' } }, NOW)
    expect(entry?.kind).toBe(RUN_LOG_KIND.REASONING)
  })

  it('raises the level on error events', () => {
    const entry = mapHermesEvent({ event: 'run.error', data: { message: 'boom' } }, NOW)
    expect(entry).toMatchObject({ level: RUN_LOG_LEVEL.ERROR, message: 'boom' })
  })

  it('treats run lifecycle as informational, sourced to hermes', () => {
    const entry = mapHermesEvent({ event: 'run.completed', data: { status: 'completed' } }, NOW)
    expect(entry).toMatchObject({
      kind: RUN_LOG_KIND.LIFECYCLE,
      source: RUN_LOG_SOURCE.HERMES,
      message: 'completed',
    })
  })

  it('surfaces unrecognized events rather than swallowing them', () => {
    const entry = mapHermesEvent({ event: 'something.new', data: { text: 'payload' } }, NOW)
    expect(entry).toMatchObject({ title: 'something.new', message: 'payload' })
  })

  it('drops unrecognized events that carry no text at all', () => {
    expect(mapHermesEvent({ event: 'keepalive', data: {} }, NOW)).toBeNull()
  })
})
