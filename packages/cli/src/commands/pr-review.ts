import { parsePrReviewOptions } from '../args.js'
import type { CliContext } from '../types.js'

const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined
    throw new Error(payload?.error ?? `Request failed: ${url} ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function runPrReview(args: string[], context: CliContext) {
  const options = parsePrReviewOptions(args)
  const apiBase = await context.resolveDefaultApiBase()

  console.log('')
  console.log(`${YELLOW}${BOLD}⚠ Experimental: pr-review is an early on-demand workflow.${RESET}`)
  console.log(`${YELLOW}It will try to apply open human PR review comments to the existing PR branch.${RESET}`)
  console.log('')

  let queuedTask: { reviewTaskId: string; prNumber: number }
  try {
    queuedTask = await postJson(`${apiBase}/tasks/${encodeURIComponent(options.taskId)}/pr-review`, {})
  } catch (error) {
    throw new Error(
      `Failed to queue PR review for task ${options.taskId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  console.log(
    `Queued PR review run for task ${options.taskId} as new task ${queuedTask.reviewTaskId} on PR #${queuedTask.prNumber}.`
  )
}
