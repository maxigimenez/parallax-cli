import { describe, expect, it } from 'vitest'
import {
  extractSummary,
  resolveSummary,
  summarizeFallback,
} from '../../src/prompts/output-contract.js'
import { renderPrompt, listTemplateNames } from '../../src/prompts/templates.js'
import { COMMENT_TARGET, TICKET_PROVIDER, TRIGGER_TYPE } from '@parallax/common'
import type { RoutingRule, TriggerEvent } from '@parallax/common'

describe('extractSummary', () => {
  it('pulls a single-line summary', () => {
    expect(extractSummary('work\nPARALLAX_SUMMARY: All good.')).toBe('All good.')
  })

  it('ignores the sentinel echoed back in the instructions', () => {
    const output = [
      'You asked me to end with PARALLAX_SUMMARY: <verdict>',
      'I did the analysis.',
      'PARALLAX_SUMMARY: Worth building.',
    ].join('\n')

    expect(extractSummary(output)).toBe('Worth building.')
  })

  it('stops at the first line that turns into a dump', () => {
    const output = [
      'PARALLAX_SUMMARY: Changed the parser.',
      'Also here is the diff:',
      '```ts',
    ].join('\n')
    expect(extractSummary(output)).toBe('Changed the parser.\nAlso here is the diff:')
  })

  it('caps the number of lines it will take', () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    expect(extractSummary(`PARALLAX_SUMMARY: start\n${body}`, 3)?.split('\n')).toHaveLength(3)
  })

  it('returns undefined with no sentinel, or an empty one', () => {
    expect(extractSummary('nothing here')).toBeUndefined()
    expect(extractSummary('PARALLAX_SUMMARY:   ')).toBeUndefined()
  })

  it('is case-insensitive about the sentinel', () => {
    expect(extractSummary('parallax_summary: ok')).toBe('ok')
  })
})

describe('summarizeFallback', () => {
  it('takes the tail, because an agent conclusion comes last', () => {
    expect(summarizeFallback('first\nmiddle\nlast', 2)).toBe('middle\nlast')
  })

  it('drops code and diff noise', () => {
    expect(summarizeFallback('real conclusion\ndiff --git a/x b/x\n+added')).toBe('real conclusion')
  })

  it('returns undefined for empty or pure-noise output', () => {
    expect(summarizeFallback('')).toBeUndefined()
    expect(summarizeFallback('```\nconst x = 1\n```')).toBeUndefined()
  })
})

describe('resolveSummary', () => {
  it('prefers the sentinel and falls back when it is absent', () => {
    expect(resolveSummary('noise\nPARALLAX_SUMMARY: explicit')).toBe('explicit')
    expect(resolveSummary('just a conclusion')).toBe('just a conclusion')
  })
})

describe('renderPrompt', () => {
  const event: TriggerEvent = {
    type: TRIGGER_TYPE.TICKET,
    projectId: 'taplands',
    provider: TICKET_PROVIDER.LINEAR,
    ref: 'LIN-1',
    revision: 'r',
    title: 'Billing export',
    body: 'Need CSV.',
    url: 'https://linear.app/x',
    labels: ['feasibility'],
    state: 'Backlog',
  }

  function routeWith(template: string): RoutingRule {
    return {
      id: 'rt_1',
      name: 'r',
      priority: 0,
      enabled: true,
      trigger: { type: TRIGGER_TYPE.TICKET, projectId: 'taplands' },
      match: {},
      target: { agentRef: { profile: 'product' } },
      execution: { promptTemplate: template, requireApproval: false, timeoutSeconds: 30 },
      outcome: { postComment: { target: COMMENT_TARGET.TICKET } },
    }
  }

  it('includes the ticket context and the output contract', () => {
    const prompt = renderPrompt({ event, route: routeWith('product-review') })

    expect(prompt).toContain('LIN-1')
    expect(prompt).toContain('Billing export')
    expect(prompt).toContain('Need CSV.')
    expect(prompt).toContain('https://linear.app/x')
    expect(prompt).toContain('feasibility')
    expect(prompt).toContain('PARALLAX_SUMMARY')
  })

  it('tells a product reviewer explicitly not to write code', () => {
    expect(renderPrompt({ event, route: routeWith('product-review') })).toContain(
      'Do not write or change any code'
    )
  })

  it('tells an implementer it owns the branch and PR', () => {
    const prompt = renderPrompt({ event, route: routeWith('implementation') })
    expect(prompt).toMatch(/create your own branch/)
    expect(prompt).toMatch(/open the pull request/)
  })

  it('handles a ticket with no description', () => {
    const prompt = renderPrompt({ event: { ...event, body: '  ' }, route: routeWith('generic') })
    expect(prompt).toContain('(no description provided)')
  })

  it('throws on an unknown template rather than silently using a default', () => {
    expect(() => renderPrompt({ event, route: routeWith('nope') })).toThrow(
      /Unknown prompt template "nope" on route "rt_1"/
    )
  })

  it('lists the templates it knows in the error', () => {
    expect(() => renderPrompt({ event, route: routeWith('nope') })).toThrow(
      new RegExp(listTemplateNames().join(', '))
    )
  })
})
