import { parseRetryOptions } from '../args.js'
import type { CliContext } from '../types.js'

export async function runRetry(args: string[], context: CliContext) {
  const options = parseRetryOptions(args)

  let apiBase: string
  try {
    apiBase = await context.resolveDefaultApiBase()
  } catch {
    throw new Error("Parallax is not running. Start it first with 'parallax start'.")
  }

  const url = `${apiBase}/tasks/${encodeURIComponent(options.taskId)}/retry`
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
  if (response.status === 409) {
    throw new Error(`Task ${options.taskId} is already running.`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Retry failed (${response.status}): ${body || response.statusText}`)
  }

  console.log(`Retried: ${options.taskId}`)
}
