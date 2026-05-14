import type { App } from '@slack/bolt'

export function registerPlanApprovalHandlers(app: App, apiBaseUrl: string): void {
  app.action('plan_approve', async ({ action, ack, respond }) => {
    await ack()
    const taskId = (action as { value: string }).value
    try {
      const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/approve`, { method: 'POST' })
      if (!res.ok) {
        await respond({ text: `Failed to approve plan for task ${taskId}: ${res.statusText}`, replace_original: false })
        return
      }
      await respond({ text: `✅ Plan approved for task \`${taskId}\`.`, replace_original: false })
    } catch (err: any) {
      await respond({ text: `Error approving plan: ${err.message}`, replace_original: false })
    }
  })

  app.action('plan_reject', async ({ action, ack, respond }) => {
    await ack()
    const taskId = (action as { value: string }).value
    try {
      const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/reject`, { method: 'POST' })
      if (!res.ok) {
        await respond({ text: `Failed to reject plan for task ${taskId}: ${res.statusText}`, replace_original: false })
        return
      }
      await respond({ text: `❌ Plan rejected for task \`${taskId}\`.`, replace_original: false })
    } catch (err: any) {
      await respond({ text: `Error rejecting plan: ${err.message}`, replace_original: false })
    }
  })
}
