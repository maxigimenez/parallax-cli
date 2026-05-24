import { parseCancelOptions } from '../args.js'
import type { CliContext } from '../types.js'

export async function runCancel(args: string[], context: CliContext) {
  const options = parseCancelOptions(args)

  let apiBase: string
  try {
    apiBase = await context.resolveDefaultApiBase()
  } catch {
    throw new Error("Parallax is not running. Start it first with 'parallax start'.")
  }

  const url = `${apiBase}/tasks/${encodeURIComponent(options.taskId)}/cancel`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })

  if (response.status === 404) {
    throw new Error(
      `Task not found: ${options.taskId}. List tasks in the dashboard or check 'parallax status'.`
    )
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Cancel failed (${response.status}): ${body || response.statusText}`)
  }

  console.log(`Canceled: ${options.taskId}`)
}
