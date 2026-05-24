import type { App } from '@slack/bolt'

export function registerSlashCommands(app: App, apiBaseUrl: string): void {
  app.command('/parallax', async ({ command, ack, respond }) => {
    await ack()
    const [subcommand, taskId] = command.text.trim().split(/\s+/)

    if (!subcommand) {
      await respond('Usage: `/parallax <retry|cancel|status|pr-review> [taskId]`')
      return
    }

    const requiresTaskId = subcommand !== 'status'
    if (requiresTaskId && !taskId) {
      await respond(`Usage: \`/parallax ${subcommand} <taskId>\``)
      return
    }

    try {
      switch (subcommand) {
        case 'retry': {
          const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/retry`, { method: 'POST' })
          if (!res.ok) {
            await respond(`Failed to retry task \`${taskId}\`: ${res.statusText}`)
            return
          }
          await respond(`🔁 Retry triggered for task \`${taskId}\`.`)
          break
        }
        case 'cancel': {
          const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/cancel`, { method: 'POST' })
          if (!res.ok) {
            await respond(`Failed to cancel task \`${taskId}\`: ${res.statusText}`)
            return
          }
          await respond(`🚫 Cancel requested for task \`${taskId}\`.`)
          break
        }
        case 'status': {
          const res = await fetch(`${apiBaseUrl}/runtime/health`)
          if (!res.ok) {
            await respond('⚠️ Could not reach Parallax orchestrator.')
            return
          }
          const data = (await res.json()) as { activeTasks: number }
          const taskLabel = data.activeTasks === 1 ? '1 task' : `${data.activeTasks} tasks`
          await respond(
            `✅ Parallax is running.\nActive tasks: ${data.activeTasks === 0 ? 'none' : taskLabel} processing.`
          )
          break
        }
        case 'pr-review': {
          const res = await fetch(`${apiBaseUrl}/tasks/${taskId}/pr-review`, { method: 'POST' })
          if (!res.ok) {
            await respond(`Failed to trigger PR review for task \`${taskId}\`: ${res.statusText}`)
            return
          }
          await respond(`🔍 PR review triggered for task \`${taskId}\`.`)
          break
        }
        default:
          await respond(
            `Unknown subcommand \`${subcommand}\`. Use: retry | cancel | status | pr-review`
          )
      }
    } catch (err: any) {
      await respond(`Error: ${err.message}`)
    }
  })
}
