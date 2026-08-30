import type { RoutingRule, TriggerEvent } from '@parallax/common'
import { SUMMARY_SENTINEL } from './output-contract.js'

export interface PromptContext {
  event: TriggerEvent
  route: RoutingRule
  /** The Hermes profile that will run this, for role-aware phrasing. */
  agentRole?: string
}

export type PromptTemplate = (context: PromptContext) => string

function summaryContract(instruction: string): string {
  return [
    '',
    'When you are done, end your reply with a single line:',
    `${SUMMARY_SENTINEL}: ${instruction}`,
    'Keep it under ten lines of prose. Do not put code, diffs, or command output on those lines.',
  ].join('\n')
}

function ticketContext(event: TriggerEvent): string {
  return [
    `Ticket: ${event.ref}`,
    `Title: ${event.title}`,
    ...(event.url ? [`Link: ${event.url}`] : []),
    ...(event.state ? [`State: ${event.state}`] : []),
    ...(event.labels.length ? [`Labels: ${event.labels.join(', ')}`] : []),
    '',
    'Description:',
    event.body.trim() || '(no description provided)',
  ].join('\n')
}

const productReview: PromptTemplate = ({ event }) =>
  [
    'You are reviewing a proposed piece of work for product sense and feasibility.',
    'Do not write or change any code. This is an assessment, not an implementation.',
    '',
    ticketContext(event),
    '',
    'Assess and report on:',
    '- What is actually being asked for, in your own words.',
    '- Whether it is worth doing, and what it competes with.',
    '- Rough feasibility and the main technical risks.',
    '- Anything underspecified that someone must decide before work starts.',
    '',
    'Be direct. If this is a bad idea, say so and say why.',
    summaryContract('<your verdict in one or two sentences>'),
  ].join('\n')

const pullRequestReview: PromptTemplate = ({ event }) =>
  [
    'You have been requested as a reviewer on a pull request.',
    'Review it as you would a colleague’s work: correctness first, then clarity.',
    '',
    `Pull request: ${event.ref}`,
    `Title: ${event.title}`,
    ...(event.url ? [`Link: ${event.url}`] : []),
    '',
    'Description:',
    event.body.trim() || '(no description provided)',
    '',
    'Read the diff before commenting. Prefer a small number of substantive findings',
    'over exhaustive nitpicking, and say plainly when the change looks good.',
    summaryContract('<your overall verdict in one or two sentences>'),
  ].join('\n')

const implementation: PromptTemplate = ({ event }) =>
  [
    'You are implementing a piece of work end to end.',
    '',
    ticketContext(event),
    '',
    'You own the whole change: create your own branch, make the edits, run the',
    'checks, commit, push, and open the pull request under your own identity.',
    'Keep the change scoped to what the ticket asks for. If you find you cannot',
    'proceed, stop and explain why rather than guessing.',
    summaryContract('<what you changed and the PR link, in one or two sentences>'),
  ].join('\n')

const generic: PromptTemplate = ({ event }) =>
  [ticketContext(event), summaryContract('<what you concluded or did>')].join('\n')

export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  'product-review': productReview,
  'pr-review': pullRequestReview,
  implementation,
  generic,
}

export function listTemplateNames(): string[] {
  return Object.keys(PROMPT_TEMPLATES).sort()
}

/**
 * Renders a route's prompt template.
 *
 * Unknown template names throw rather than silently falling back to `generic`:
 * a typo in a routing rule should surface as a clear dispatch failure on that
 * one route, not as an agent quietly receiving the wrong instructions.
 */
export function renderPrompt(context: PromptContext): string {
  const name = context.route.execution.promptTemplate
  const template = PROMPT_TEMPLATES[name]
  if (!template) {
    throw new Error(
      `Unknown prompt template "${name}" on route "${context.route.id}". Available: ${listTemplateNames().join(', ')}.`
    )
  }
  return template(context)
}
