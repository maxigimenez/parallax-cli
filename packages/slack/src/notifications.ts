import type { WebClient } from '@slack/web-api'
import type { SlackNotificationPayload } from './types.js'
import { buildEventMessage, buildPlanApprovalMessage } from './formatters.js'

export async function sendNotification(
  client: WebClient,
  channel: string,
  payload: SlackNotificationPayload,
  threadRegistry: Map<string, string>,
  taskToThread: Map<string, string>
): Promise<void> {
  const { task, event, extra, agentModel } = payload

  if (event === 'plan_ready') {
    const result = await client.chat.postMessage({
      channel,
      blocks: buildPlanApprovalMessage(task, agentModel),
      text: `Plan ready for ${task.externalId}: ${task.title}`,
    })
    if (result.ts) {
      threadRegistry.set(result.ts, task.id)
    }
    return
  }

  if (event === 'execution_started') {
    const result = await client.chat.postMessage({
      channel,
      blocks: buildEventMessage(task, event, extra),
      text: `[${event}] ${task.externalId}: ${task.title}`,
    })
    if (result.ts) {
      taskToThread.set(task.id, result.ts)
    }
    return
  }

  if (event === 'failed') {
    const threadTs = taskToThread.get(task.id)
    await client.chat.postMessage({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      blocks: buildEventMessage(task, event, extra),
      text: `[${event}] ${task.externalId}: ${task.title}`,
    })
    if (threadTs) {
      taskToThread.delete(task.id)
    }
    return
  }

  await client.chat.postMessage({
    channel,
    blocks: buildEventMessage(task, event, extra),
    text: `[${event}] ${task.externalId}: ${task.title}`,
  })
}
