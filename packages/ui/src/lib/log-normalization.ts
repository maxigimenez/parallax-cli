import { TASK_LOG_KIND, type TaskLogEntry } from '@parallax/common'

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripTaskPrefix(message: string) {
  return message.replace(/^\[[^\]]+\]\s*/, '').trim()
}

function getDefaultLogTitle(kind: TaskLogEntry['kind']) {
  switch (kind) {
    case TASK_LOG_KIND.COMMAND:
      return 'Command'
    case TASK_LOG_KIND.FILE_CHANGE:
      return 'File change'
    case TASK_LOG_KIND.REASONING:
      return 'Reasoning'
    case TASK_LOG_KIND.AGENT_MESSAGE:
      return 'Agent message'
    case TASK_LOG_KIND.MCP:
      return 'MCP'
    case TASK_LOG_KIND.WARNING:
      return 'Warning'
    case TASK_LOG_KIND.ERROR:
      return 'Error'
    case TASK_LOG_KIND.RESULT:
      return 'Result'
    default:
      return 'Event'
  }
}

function stripLeadingLabel(message: string, label: string) {
  if (!label) {
    return message
  }

  return message.replace(new RegExp(`^${escapeForRegex(label)}\\s+`, 'i'), '').trim()
}

export function normalizeTaskLogMessage(log: Pick<TaskLogEntry, 'message' | 'title' | 'kind'>) {
  const withoutTaskPrefix = stripTaskPrefix(log.message)
  const withoutExplicitTitle = stripLeadingLabel(withoutTaskPrefix, log.title ?? '')
  return stripLeadingLabel(withoutExplicitTitle, getDefaultLogTitle(log.kind))
}

export function canonicalizeTaskLogMessage(
  log: Pick<TaskLogEntry, 'message' | 'icon' | 'title' | 'kind'>
) {
  const normalizedMessage = normalizeTaskLogMessage(log)
  const escapedIcon = escapeForRegex(log.icon)
  return normalizedMessage.replace(new RegExp(`^${escapedIcon}\\s+`), '').trim()
}

export { getDefaultLogTitle }
