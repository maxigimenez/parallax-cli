import type { App } from '@slack/bolt'

export function registerPlanApprovalHandlers(app: App, apiBaseUrl: string): void {
  app.action('plan_approve', async ({ action, ack, respond, body }) => {
    await ack()
    const taskId = (action as { value: string }).value
    try {
      const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/approve`, { method: 'POST' })
      if (!res.ok) {
        await respond({
          response_type: 'in_channel',
          text: `Failed to approve plan for task ${taskId}: ${res.statusText}`,
          replace_original: false,
        })
        return
      }
      const originalBlocks = ((body as any).message?.blocks ?? []).filter(
        (b: any) => b.type !== 'actions'
      )
      await respond({
        replace_original: true,
        blocks: [
          ...originalBlocks,
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `✅ *Plan approved*` },
          },
        ],
      })
    } catch (err: any) {
      await respond({
        response_type: 'in_channel',
        text: `Error approving plan: ${err.message}`,
        replace_original: false,
      })
    }
  })

  app.action('plan_reject', async ({ action, ack, respond, body }) => {
    await ack()
    const taskId = (action as { value: string }).value
    try {
      const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/reject`, { method: 'POST' })
      if (!res.ok) {
        await respond({
          response_type: 'in_channel',
          text: `Failed to reject plan for task ${taskId}: ${res.statusText}`,
          replace_original: false,
        })
        return
      }
      const originalBlocks = ((body as any).message?.blocks ?? []).filter(
        (b: any) => b.type !== 'actions'
      )
      await respond({
        replace_original: true,
        blocks: [
          ...originalBlocks,
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `❌ *Plan rejected*` },
          },
        ],
      })
    } catch (err: any) {
      await respond({
        response_type: 'in_channel',
        text: `Error rejecting plan: ${err.message}`,
        replace_original: false,
      })
    }
  })
}
