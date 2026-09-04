import { describe, expect, it } from 'vitest'
import {
  COMMENT_TARGET,
  PROMPT_CATALOG,
  PROMPT_VARIABLES,
  TICKET_PROVIDER,
  TRIGGER_TYPE,
  type RoutingRule,
  type TriggerEvent,
} from '@sentinel0/common'
import {
  renderPromptText,
  renderRoutePrompt,
  withSummaryContract,
} from '../../src/prompts/render.js'
import {
  extractSummary,
  resolveSummary,
  summarizeFallback,
} from '../../src/prompts/output-contract.js'

const event: TriggerEvent = {
  type: TRIGGER_TYPE.TICKET,
  projectId: 'taplands',
  provider: TICKET_PROVIDER.LINEAR,
  ref: 'LIN-1',
  revision: 'r',
  title: 'Billing export',
  body: 'Need CSV.',
  url: 'https://linear.app/x',
  labels: ['feasibility', 'billing'],
  state: 'Backlog',
}

function routeWith(prompt: string): RoutingRule {
  return {
    id: 'rt_1',
    name: 'r',
    priority: 0,
    enabled: true,
    trigger: { type: TRIGGER_TYPE.TICKET, projectId: 'taplands' },
    match: {},
    target: { agentRef: { profile: 'product' } },
    execution: { prompt, requireApproval: false, timeoutSeconds: 30 },
    outcome: { postComment: { target: COMMENT_TARGET.TICKET } },
  }
}

const context = { event, route: routeWith(''), agentProfile: 'product', agentRole: 'product' }

describe('renderPromptText', () => {
  it('interpolates ticket fields', () => {
    const { prompt } = renderPromptText(
      '{{ticket.ref}} / {{ticket.title}} / {{ticket.url}} / {{ticket.state}}',
      context
    )
    expect(prompt).toBe('LIN-1 / Billing export / https://linear.app/x / Backlog')
  })

  it('joins labels and reviewers as readable lists', () => {
    expect(renderPromptText('{{ticket.labels}}', context).prompt).toBe('feasibility, billing')
    expect(
      renderPromptText('{{pr.reviewers}}', {
        ...context,
        event: { ...event, requestedReviewers: ['a', 'b'] },
      }).prompt
    ).toBe('a, b')
  })

  it('interpolates project and agent context', () => {
    const { prompt } = renderPromptText('{{project.id}}|{{agent.profile}}|{{agent.role}}', context)
    expect(prompt).toBe('taplands|product|product')
  })

  it('substitutes a placeholder for a missing description', () => {
    const { prompt } = renderPromptText('{{ticket.body}}', {
      ...context,
      event: { ...event, body: '   ' },
    })
    expect(prompt).toBe('(no description provided)')
  })

  it('renders absent optional values as empty rather than "undefined"', () => {
    const { prompt } = renderPromptText('[{{ticket.url}}][{{pr.number}}]', {
      ...context,
      event: { ...event, url: undefined },
    })
    expect(prompt).toBe('[][]')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(renderPromptText('{{  ticket.ref  }}', context).prompt).toBe('LIN-1')
  })

  it('leaves an unknown placeholder visible and reports it', () => {
    const { prompt, unknown } = renderPromptText('a {{ticket.titel}} b', context)
    // Blanking a typo would produce a confidently wrong run; this makes it obvious.
    expect(prompt).toBe('a {{ticket.titel}} b')
    expect(unknown).toEqual(['ticket.titel'])
  })

  it('leaves text with no placeholders untouched', () => {
    expect(renderPromptText('just words', context).prompt).toBe('just words')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(renderPromptText('{{ticket.ref}} {{ticket.ref}}', context).prompt).toBe('LIN-1 LIN-1')
  })

  it('can resolve every advertised variable', () => {
    const full = { ...context, event: { ...event, prNumber: 7, requestedReviewers: ['bot'] } }
    for (const variable of PROMPT_VARIABLES) {
      expect(renderPromptText(`{{${variable}}}`, full).unknown).toEqual([])
    }
  })
})

describe('withSummaryContract', () => {
  it('appends the contract when the prompt does not ask for it', () => {
    expect(withSummaryContract('do the thing')).toContain('SENTINEL0_SUMMARY')
  })

  it('leaves a prompt that already words it alone', () => {
    const custom = 'do it, then write SENTINEL0_SUMMARY: <verdict> exactly once'
    expect(withSummaryContract(custom)).toBe(custom)
  })
})

describe('renderRoutePrompt', () => {
  it('renders the route prompt and guarantees the contract', () => {
    const route = routeWith('Review {{ticket.ref}}.')
    const { prompt } = renderRoutePrompt({ ...context, route })

    expect(prompt).toContain('Review LIN-1.')
    expect(prompt).toContain('SENTINEL0_SUMMARY')
  })
})

describe('prompt catalog', () => {
  it('offers starter prompts with stable ids', () => {
    expect(PROMPT_CATALOG.map((entry) => entry.id)).toContain('product-review')
    expect(PROMPT_CATALOG.every((entry) => entry.prompt.length > 0)).toBe(true)
  })

  it('only uses placeholders the renderer knows', () => {
    for (const template of PROMPT_CATALOG) {
      expect(renderPromptText(template.prompt, context).unknown).toEqual([])
    }
  })
})

describe('summary extraction', () => {
  it('prefers the sentinel and falls back to the tail', () => {
    expect(extractSummary('x\nSENTINEL0_SUMMARY: done')).toBe('done')
    expect(summarizeFallback('first\nlast', 1)).toBe('last')
    expect(resolveSummary('just a conclusion')).toBe('just a conclusion')
  })
})
