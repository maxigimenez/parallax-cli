import type { Task } from '@parallax/common'
import type { Block, KnownBlock } from '@slack/web-api'

const MAX_PLAN_LENGTH = 2500

function agentIdentityLine(task: Task): string {
  return task.lastAgent ?? 'Agent'
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}… (truncated)`
}

function markdownToMrkdwn(text: string): string {
  return (
    text
      // Headers → bold line
      .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
      // **bold** → *bold*
      .replace(/\*\*(.+?)\*\*/gs, '*$1*')
      // [text](url) → <url|text>
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
  )
}

export function buildPlanApprovalMessage(task: Task): (Block | KnownBlock)[] {
  const planText = task.planMarkdown
    ? truncate(task.planMarkdown, MAX_PLAN_LENGTH)
    : 'No plan content available.'

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Plan Ready — ${agentIdentityLine(task)}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Project:* ${task.projectId}\n*Task:* ${task.externalId} · ${task.title}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Proposed Plan*\n${markdownToMrkdwn(planText)}`,
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
  extra?: string
): (Block | KnownBlock)[] {
  const eventLabels: Record<string, string> = {
    pr_created: '🔀 PR Created',
    failed: '❌ Failed',
    canceled: '🚫 Canceled',
    execution_started: '🚀 Execution Started',
  }

  const label = eventLabels[event] ?? event
  const agentLine = agentIdentityLine(task)

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
