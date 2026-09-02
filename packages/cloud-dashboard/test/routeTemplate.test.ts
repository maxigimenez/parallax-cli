import { describe, expect, it } from 'vitest'
import { fillRouteTemplate, missingPlaceholders } from '../src/lib/routeTemplate.js'
import type { RouteTemplate } from '../src/api/types.js'

const template: RouteTemplate = {
  id: 'ticket-label-analysis',
  name: 'Assess on label',
  summary: 'summary',
  description: 'description',
  placeholders: [
    { token: '<PROJECT_ID>', label: 'Project', hint: 'the project' },
    { token: '<AGENT_PROFILE>', label: 'Agent', hint: 'the agent' },
  ],
  route: {
    name: 'Assess on label',
    priority: 100,
    enabled: true,
    trigger: { type: 'ticket', projectId: '<PROJECT_ID>' },
    target: { agentRef: { profile: '<AGENT_PROFILE>' } },
    execution: { prompt: 'Assess {{ticket.ref}} in <PROJECT_ID>.' },
  },
}

describe('fillRouteTemplate', () => {
  it('substitutes every occurrence of a token, including inside the prompt', () => {
    const filled = fillRouteTemplate(template, {
      '<PROJECT_ID>': 'acme/platform',
      '<AGENT_PROFILE>': 'product',
    })
    expect(filled.trigger.projectId).toBe('acme/platform')
    expect(filled.target.agentRef?.profile).toBe('product')
    expect(filled.execution.prompt).toBe('Assess {{ticket.ref}} in acme/platform.')
  })

  // Blanking it would produce a route that is structurally valid and can never
  // match. Leaving the token in gets the request rejected instead.
  it('leaves an unfilled token visible rather than blanking it', () => {
    const filled = fillRouteTemplate(template, { '<PROJECT_ID>': 'acme/platform' })
    expect(filled.target.agentRef?.profile).toBe('<AGENT_PROFILE>')
  })

  it('treats whitespace as unfilled', () => {
    const filled = fillRouteTemplate(template, {
      '<PROJECT_ID>': '   ',
      '<AGENT_PROFILE>': 'product',
    })
    expect(filled.trigger.projectId).toBe('<PROJECT_ID>')
  })

  it('never mutates the template it was given', () => {
    const before = JSON.stringify(template)
    fillRouteTemplate(template, { '<PROJECT_ID>': 'acme/platform' })
    expect(JSON.stringify(template)).toBe(before)
  })

  // A value containing a quote would otherwise break the serialized route.
  it('survives values that need JSON escaping', () => {
    const filled = fillRouteTemplate(template, { '<PROJECT_ID>': 'a"b\\c' })
    expect(filled.trigger.projectId).toBe('a"b\\c')
  })
})

describe('missingPlaceholders', () => {
  it('names every token still unfilled', () => {
    expect(missingPlaceholders(template, {})).toEqual(['<PROJECT_ID>', '<AGENT_PROFILE>'])
    expect(missingPlaceholders(template, { '<PROJECT_ID>': 'x', '<AGENT_PROFILE>': 'y' })).toEqual(
      []
    )
  })

  it('does not accept whitespace as an answer', () => {
    expect(missingPlaceholders(template, { '<PROJECT_ID>': ' ', '<AGENT_PROFILE>': 'y' })).toEqual([
      '<PROJECT_ID>',
    ])
  })
})
