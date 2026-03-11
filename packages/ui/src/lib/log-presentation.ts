import { TASK_LOG_KIND, type TaskLogEntry } from '@parallax/common'
import { getDefaultLogTitle, normalizeTaskLogMessage } from './log-normalization'

export type ActivityItem =
  | {
      type: 'compact'
      id: string
      timestamp: number
      level: TaskLogEntry['level']
      kind: TaskLogEntry['kind']
      title: string
      message: string
      icon: string
    }
  | {
      type: 'detail'
      id: string
      timestamp: number
      level: TaskLogEntry['level']
      kind: TaskLogEntry['kind']
      title: string
      body: string
    }

export function normalizeLogMessage(message: string, title?: string, kind?: TaskLogEntry['kind']) {
  return normalizeTaskLogMessage({
    message,
    title,
    kind: kind ?? TASK_LOG_KIND.LIFECYCLE,
  })
}

const DETAIL_KIND_SET = new Set([
  TASK_LOG_KIND.COMMAND,
  TASK_LOG_KIND.FILE_CHANGE,
  TASK_LOG_KIND.REASONING,
  TASK_LOG_KIND.AGENT_MESSAGE,
  TASK_LOG_KIND.MCP,
  TASK_LOG_KIND.WARNING,
  TASK_LOG_KIND.ERROR,
  TASK_LOG_KIND.RESULT,
])

function buildActivityItemId(log: TaskLogEntry, title: string, message: string) {
  return [
    log.kind,
    log.timestamp,
    title,
    log.level,
    log.source,
    log.groupId ?? '',
    message,
  ].join('|')
}

export function buildActivityItems(logs: TaskLogEntry[]): ActivityItem[] {
  return logs.map((log) => {
    const title = log.title || getDefaultLogTitle(log.kind)
    const message = normalizeLogMessage(log.message, log.title, log.kind)
    const id = buildActivityItemId(log, title, message)

    if (DETAIL_KIND_SET.has(log.kind)) {
      return {
        type: 'detail',
        id,
        timestamp: log.timestamp,
        level: log.level,
        kind: log.kind,
        title,
        body: message,
      }
    }

    return {
      type: 'compact',
      id,
      timestamp: log.timestamp,
      level: log.level,
      kind: log.kind,
      title,
      message,
      icon: log.icon,
    }
  })
}
