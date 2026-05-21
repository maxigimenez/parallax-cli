import type { WebClient } from '@slack/web-api'
import type { SlackNotificationPayload } from './types.js'
import { buildEventMessage, buildPlanApprovalMessage } from './formatters.js'

export async function sendNotification(
  client: WebClient,
  channel: string,
  payload: SlackNotificationPayload,
  threadRegistry: Map<string, string>
): Promise<void> {
  const { task, event, agentDef, extra } = payload

  if (event === 'plan_ready') {
    const result = await client.chat.postMessage({
      channel,
      blocks: buildPlanApprovalMessage(task, agentDef),
      text: `Plan ready for ${task.externalId}: ${task.title}`,
    })
    if (result.ts) {
      threadRegistry.set(result.ts, task.id)
    }
    return
  }

  await client.chat.postMessage({
    channel,
    blocks: buildEventMessage(task, event, agentDef, extra),
    text: `[${event}] ${task.externalId}: ${task.title}`,
  })
}
