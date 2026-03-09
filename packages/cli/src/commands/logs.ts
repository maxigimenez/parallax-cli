import { sleep } from '@parallax/common'
import { parseLogsOptions } from '../args.js'
import type { CliContext } from '../types.js'

type TaskLogsApiRecord = {
  taskExternalId: string
  message: string
  icon: string
  level: 'info' | 'warning' | 'error'
  timestamp: number
}

function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

export async function runLogs(args: string[], context: CliContext) {
  const options = parseLogsOptions(args)
  const apiBase = await context.resolveDefaultApiBase()
  let cursor = 0
  let seenAtCursor = new Set<string>()

  while (true) {
    const params = new URLSearchParams({
      since: String(cursor),
      limit: '500',
    })
    if (options.taskId) {
      params.set('taskId', options.taskId)
    }

    const response = await fetchJson<{ logs: TaskLogsApiRecord[] }>(
      `${apiBase}/logs?${params.toString()}`
    )

    for (const entry of response.logs) {
      const signature = `${entry.timestamp}|${entry.level}|${entry.icon}|${entry.message}`
      if (entry.timestamp < cursor) {
        continue
      }
      if (entry.timestamp === cursor && seenAtCursor.has(signature)) {
        continue
      }

      console.log(
        `${formatTimestamp(entry.timestamp)} [${entry.taskExternalId}] ${entry.level.toUpperCase()} ${entry.icon} ${entry.message}`
      )
      if (entry.timestamp > cursor) {
        cursor = entry.timestamp
        seenAtCursor = new Set<string>()
      }
      seenAtCursor.add(signature)
    }

    await sleep(2000)
  }
}
