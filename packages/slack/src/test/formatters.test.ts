import { describe, it, expect } from 'vitest'
import { buildPlanApprovalMessage, buildEventMessage } from '../formatters'
import type { AgentDefinition, Task } from '@parallax/common'

const baseTask: Task = {
  id: 'task-1',
  externalId: 'ORG/REPO#42',
  title: 'Add rate limiting',
  description: 'Protect the API from abuse',
  status: 'PENDING',
  projectId: 'my-repo',
  createdAt: 0,
  updatedAt: 0,
}

const agentDef: AgentDefinition = {
  name: 'developer',
  provider: 'claude-code',
  model: 'claude-opus-4-5',
}

describe('buildPlanApprovalMessage', () => {
  it('includes agent name and provider in the header', () => {
    const blocks = buildPlanApprovalMessage(baseTask, agentDef)
    const header = blocks.find((b: any) => b.type === 'header') as any
    expect(header?.text?.text).toContain('developer')
    expect(header?.text?.text).toContain('claude-code')
    expect(header?.text?.text).toContain('claude-opus-4-5')
  })

  it('includes task externalId and title in section fields', () => {
    const blocks = buildPlanApprovalMessage(baseTask, agentDef)
    const json = JSON.stringify(blocks)
    expect(json).toContain('ORG/REPO#42')
    expect(json).toContain('Add rate limiting')
  })

  it('includes Approve and Reject action buttons', () => {
    const blocks = buildPlanApprovalMessage(baseTask, agentDef)
    const actions = blocks.find((b: any) => b.type === 'actions') as any
    const actionIds = actions?.elements?.map((e: any) => e.action_id)
    expect(actionIds).toContain('plan_approve')
    expect(actionIds).toContain('plan_reject')
  })

  it('sets button values to task.id', () => {
    const blocks = buildPlanApprovalMessage(baseTask, agentDef)
    const actions = blocks.find((b: any) => b.type === 'actions') as any
    const values = actions?.elements?.map((e: any) => e.value)
    expect(values).toEqual(['task-1', 'task-1'])
  })

  it('shows plan markdown in a section block', () => {
    const task: Task = { ...baseTask, planMarkdown: 'Step 1: do the thing\nStep 2: test it' }
    const blocks = buildPlanApprovalMessage(task, agentDef)
    const json = JSON.stringify(blocks)
    expect(json).toContain('Step 1: do the thing')
  })

  it('truncates plan markdown longer than 2500 characters', () => {
    const longPlan = 'x'.repeat(3000)
    const task: Task = { ...baseTask, planMarkdown: longPlan }
    const blocks = buildPlanApprovalMessage(task, agentDef)
    const json = JSON.stringify(blocks)
    expect(json).toContain('truncated')
    expect(json).not.toContain('x'.repeat(2600))
  })

  it('works without an agentDef (unknown agent fallback)', () => {
    const blocks = buildPlanApprovalMessage(baseTask, undefined)
    const header = blocks.find((b: any) => b.type === 'header') as any
    expect(header?.text?.text).toContain('Unknown agent')
  })
})

describe('buildEventMessage', () => {
  it('includes agent identity in the message text', () => {
    const blocks = buildEventMessage(baseTask, 'pr_created', agentDef, 'https://github.com/pr/1')
    const section = blocks.find((b: any) => b.type === 'section') as any
    expect(section?.text?.text).toContain('developer')
    expect(section?.text?.text).toContain('claude-code')
  })

  it('includes the event label in the message', () => {
    const blocks = buildEventMessage(baseTask, 'pr_created', agentDef)
    const section = blocks.find((b: any) => b.type === 'section') as any
    expect(section?.text?.text).toContain('PR Created')
  })

  it('includes task externalId and title', () => {
    const blocks = buildEventMessage(baseTask, 'failed', agentDef)
    const json = JSON.stringify(blocks)
    expect(json).toContain('ORG/REPO#42')
    expect(json).toContain('Add rate limiting')
  })

  it('appends an extra detail block when extra is provided', () => {
    const blocks = buildEventMessage(baseTask, 'failed', agentDef, 'Agent out of tokens')
    expect(blocks).toHaveLength(2)
    const extra = blocks[1] as any
    expect(extra.text.text).toContain('Agent out of tokens')
  })

  it('returns a single block when extra is not provided', () => {
    const blocks = buildEventMessage(baseTask, 'canceled', agentDef)
    expect(blocks).toHaveLength(1)
  })
})
