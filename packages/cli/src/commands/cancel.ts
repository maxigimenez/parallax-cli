import { parseCancelOptions } from '../args.js'
import type { CliContext } from '../types.js'

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status} ${response.statusText}`)
  }
}

export async function runCancel(args: string[], context: CliContext) {
  const options = parseCancelOptions(args)
  const apiBase = options.apiBase || (await context.resolveDefaultApiBase(context.defaultDataDir))
  await postJson(`${apiBase}/tasks/${encodeURIComponent(options.taskId)}/cancel`, {})
  console.log(`Canceled: ${options.taskId}`)
}
