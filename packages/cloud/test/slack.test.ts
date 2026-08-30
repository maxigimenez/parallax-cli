import { describe, expect, it } from 'vitest'
import { RUN_STATUS, TRIGGER_TYPE, type RunRecord } from '@parallax/common'
import { buildSlackMessage } from '../src/notifications/slack.js'

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'pxr_1',
    routeId: 'rt_1',
    routeName: 'Product review',
    agentProfile: 'product',
    projectId: 'taplands',
    triggerType: TRIGGER_TYPE.TICKET,
    triggerRef: 'LIN-123',
    triggerRevision: 'r',
    triggerUrl: 'https://linear.app/x/LIN-123',
    title: 'Billing export',
    status: RUN_STATUS.COMPLETED,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('buildSlackMessage', () => {
  it('leads with the agent and what it did', () => {
    const message = buildSlackMessage('run.completed', run()) as { text: string }
    expect(message.text).toContain('*product*')
    expect(message.text).toContain('finished')
    expect(message.text).toContain('Billing export')
  })

  it('links the trigger when there is a url, and falls back to the ref', () => {
    expect((buildSlackMessage('run.started', run()) as { text: string }).text).toContain(
      '<https://linear.app/x/LIN-123|LIN-123>'
    )
    const noUrl = buildSlackMessage('run.started', run({ triggerUrl: undefined })) as {
      text: string
    }
    expect(noUrl.text).toContain('LIN-123')
    expect(noUrl.text).not.toContain('<https')
  })

  it('reports duration only when the run actually ran', () => {
    const timed = run({ startedAt: 1_000, endedAt: 96_000 })
    expect((buildSlackMessage('run.completed', timed) as { text: string }).text).toContain(
      'in 1m 35s'
    )
    expect((buildSlackMessage('run.started', run()) as { text: string }).text).not.toContain('in ')
  })

  it('shows the error on failure and the summary on success', () => {
    const failed = run({ status: RUN_STATUS.FAILED, error: 'tool crashed', summary: 'ignored' })
    expect((buildSlackMessage('run.failed', failed) as { text: string }).text).toContain(
      'tool crashed'
    )

    const ok = run({ summary: 'Worth doing.' })
    expect((buildSlackMessage('run.completed', ok) as { text: string }).text).toContain(
      'Worth doing.'
    )
  })

  it('truncates a long detail rather than flooding the channel', () => {
    const long = run({ summary: 'x'.repeat(2000) })
    const text = (buildSlackMessage('run.completed', long) as { text: string }).text
    expect(text.length).toBeLessThan(900)
    expect(text).toContain('…')
  })

  it('has a distinct opener for every event it handles', () => {
    const events = [
      'run.started',
      'run.completed',
      'run.failed',
      'run.needs_approval',
      'run.canceled',
      'runner.stale',
    ] as const
    const openers = events.map(
      (event) => (buildSlackMessage(event, run()) as { text: string }).text.split('\n')[0]
    )
    expect(new Set(openers).size).toBe(events.length)
  })
})
