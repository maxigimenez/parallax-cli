/**
 * Starter prompts offered when creating a route.
 *
 * These are a catalog, not a code path. Nothing dispatches "by template": the
 * route stores its own prompt text, and these exist only so the dashboard can
 * prefill the editor with something sensible rather than an empty box. Editing
 * one here changes what new routes start from; it never changes an existing
 * route, which is the point.
 */
export interface PromptTemplate {
  id: string
  name: string
  description: string
  prompt: string
}

export const PROMPT_CATALOG: PromptTemplate[] = [
  {
    id: 'product-review',
    name: 'Product review',
    description: 'Assess a ticket for product sense and feasibility. Writes no code.',
    prompt: [
      'You are reviewing a proposed piece of work for product sense and feasibility.',
      'Do not write or change any code. This is an assessment, not an implementation.',
      '',
      'Ticket: {{ticket.ref}}',
      'Title: {{ticket.title}}',
      'Link: {{ticket.url}}',
      'Labels: {{ticket.labels}}',
      '',
      'Description:',
      '{{ticket.body}}',
      '',
      'Assess and report on:',
      '- What is actually being asked for, in your own words.',
      '- Whether it is worth doing, and what it competes with.',
      '- Rough feasibility and the main technical risks.',
      '- Anything underspecified that someone must decide before work starts.',
      '',
      'Be direct. If this is a bad idea, say so and say why.',
    ].join('\n'),
  },
  {
    id: 'pr-review',
    name: 'Pull request review',
    description: 'Review a pull request you were requested on. Fetches its own diff and thread.',
    // Sentinel0 says which pull request and what to do; the agent has gh and
    // gets the diff and the conversation itself. Inlining them here would put
    // Sentinel0 back in the business of fetching context the agent can reach.
    prompt: [
      'You have been requested as a reviewer on a pull request.',
      '',
      'Pull request: {{ticket.ref}}',
      'Title: {{ticket.title}}',
      'Link: {{ticket.url}}',
      '',
      'Start by reading it yourself:',
      '  gh pr view {{pr.number}} --repo {{repo.slug}} --json title,body,comments,reviews',
      '  gh pr diff {{pr.number}} --repo {{repo.slug}}',
      '',
      'If you have reviewed this pull request before, your earlier comments are in',
      'that thread. Read what the author said in reply and pick up from there rather',
      'than repeating findings that have already been addressed or answered.',
      '',
      'Review it as you would a colleague’s work: correctness first, then clarity.',
      'Prefer a small number of substantive findings over exhaustive nitpicking, and',
      'say plainly when it looks good.',
      '',
      'Leave your review on the pull request itself with `gh pr review`, as a formal',
      'approval or request for changes rather than a bare comment.',
    ].join('\n'),
  },
  {
    id: 'implementation',
    name: 'Implementation',
    description: 'Implement a ticket end to end, opening the pull request yourself.',
    prompt: [
      'You are implementing a piece of work end to end.',
      '',
      'Ticket: {{ticket.ref}}',
      'Title: {{ticket.title}}',
      'Link: {{ticket.url}}',
      '',
      'Description:',
      '{{ticket.body}}',
      '',
      'You own the whole change: create your own branch, make the edits, run the',
      'checks, commit, push, and open the pull request under your own identity.',
      'Keep the change scoped to what the ticket asks for. If you cannot proceed,',
      'stop and explain why rather than guessing.',
    ].join('\n'),
  },
  {
    id: 'triage',
    name: 'Triage',
    description: 'Summarize and categorize an incoming ticket.',
    prompt: [
      'Triage this incoming ticket.',
      '',
      'Ticket: {{ticket.ref}}',
      'Title: {{ticket.title}}',
      'State: {{ticket.state}}',
      'Labels: {{ticket.labels}}',
      '',
      'Description:',
      '{{ticket.body}}',
      '',
      'Say what kind of work this is, how urgent it looks, and what information is',
      'missing before anyone could start on it. Do not write code.',
    ].join('\n'),
  },
]

export function findPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_CATALOG.find((template) => template.id === id)
}
