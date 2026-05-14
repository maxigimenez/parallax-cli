import type { AgentDefinition, Task } from '@parallax/common'
import type { Block, KnownBlock } from '@slack/bolt'

const MAX_PLAN_LENGTH = 2500
const MAX_DESCRIPTION_LENGTH = 300

function agentIdentityLine(agentDef?: AgentDefinition): string {
  if (!agentDef) return 'Unknown agent'
  const model = agentDef.model ? ` / ${agentDef.model}` : ''
  return `${agentDef.name} (${agentDef.provider}${model})`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}… (truncated)`
}

export function buildPlanApprovalMessage(task: Task, agentDef?: AgentDefinition): (Block | KnownBlock)[] {
  const description = truncate(task.description || 'No description provided.', MAX_DESCRIPTION_LENGTH)
  const planText = task.planMarkdown
    ? truncate(task.planMarkdown, MAX_PLAN_LENGTH)
    : 'No plan content available.'

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Plan Ready — ${agentIdentityLine(agentDef)}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Task:* ${task.externalId} · ${task.title}` },
        { type: 'mrkdwn', text: `*Project:* ${task.projectId}` },
        { type: 'mrkdwn', text: `*Description:*\n${description}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Proposed Plan*\n\`\`\`\n${planText}\n\`\`\``,
      },
    },
    {
      type: 'actions',
      block_id: `plan_actions_${task.id}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve', emoji: true },
          style: 'primary',
          action_id: 'plan_approve',
          value: task.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Reject', emoji: true },
          style: 'danger',
          action_id: 'plan_reject',
          value: task.id,
        },
      ],
    },
  ] as (Block | KnownBlock)[]
}

export function buildEventMessage(
  task: Task,
  event: string,
  agentDef?: AgentDefinition,
  extra?: string
): (Block | KnownBlock)[] {
  const eventLabels: Record<string, string> = {
    pr_created: '🔀 PR Created',
    failed: '❌ Failed',
    canceled: '🚫 Canceled',
    execution_started: '🚀 Execution Started',
  }

  const label = eventLabels[event] ?? event
  const agentLine = agentIdentityLine(agentDef)

  const blocks: (Block | KnownBlock)[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${agentLine}* · ${label}\n*Task:* ${task.externalId} — ${task.title}`,
      },
    },
  ]

  if (extra) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: extra },
    })
  }

  return blocks
}
