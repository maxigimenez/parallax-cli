import chalk from 'chalk'
import { sleep } from '@parallax/common'
import { parseLogsOptions } from '../args.js'
import type { CliContext } from '../types.js'

export type TaskLogsApiRecord = {
  taskExternalId: string
  message: string
  icon: string
  level: 'info' | 'warning' | 'error'
  timestamp: number
}

export function formatLogLine(entry: TaskLogsApiRecord, colors: typeof chalk = chalk): string {
  const timestamp = colors.dim(new Date(entry.timestamp).toISOString())
  const taskExternalId = colors.magenta(`[${entry.taskExternalId}]`)
  const level =
    entry.level === 'warning'
      ? colors.yellow(entry.level.toUpperCase())
      : entry.level === 'error'
        ? colors.red(entry.level.toUpperCase())
        : colors.blue(entry.level.toUpperCase())
  const icon =
    entry.level === 'warning'
      ? colors.yellow(entry.icon)
      : entry.level === 'error'
        ? colors.red(entry.icon)
        : colors.blue(entry.icon)

  return `${timestamp} ${taskExternalId} ${level} ${icon} ${entry.message}`
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
  let cursor = Date.now()
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

      console.log(formatLogLine(entry))
      if (entry.timestamp > cursor) {
        cursor = entry.timestamp
        seenAtCursor = new Set<string>()
      }
      seenAtCursor.add(signature)
    }

    await sleep(2000)
  }
}
