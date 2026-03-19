import {
  TASK_LOG_KIND,
  TASK_LOG_LEVEL,
  TASK_LOG_SOURCE,
  type TaskLogKind,
  type TaskLogLevel,
  type TaskLogSource,
} from '@parallax/common'

export type StreamLogEvent = {
  level: TaskLogLevel
  kind: TaskLogKind
  source: TaskLogSource
  message: string
  groupId?: string
}

const DIFF_LINE_PATTERNS = [
  /^diff --git /,
  /^index [0-9a-f]+\.\.[0-9a-f]+/,
  /^--- /,
  /^\+\+\+ /,
  /^@@ /,
  /^[+-][^-+].+/,
]

function isDiffLine(line: string) {
  return DIFF_LINE_PATTERNS.some((pattern) => pattern.test(line))
}

function buildGroupId(kind: TaskLogKind, line: string) {
  if (kind !== TASK_LOG_KIND.FILE_CHANGE) {
    return undefined
  }

  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
  return match ? `diff:${match[2]}` : 'diff'
}

function isMcpLifecycleLine(lowerLine: string) {
  return (
    lowerLine.startsWith('mcp:') &&
    (lowerLine.includes('starting') || lowerLine.includes('ready') || lowerLine.includes('started'))
  )
}

function isMcpWarningLine(lowerLine: string) {
  return (
    lowerLine.startsWith('mcp:') &&
    (lowerLine.includes('not logged in') ||
      lowerLine.includes('invalid token') ||
      lowerLine.includes('missing or invalid access token') ||
      lowerLine.includes('authrequirederror') ||
      lowerLine.includes('failed: notion') ||
      lowerLine.includes('transport channel closed'))
  )
}

export function classifyAgentLogChunk(line: string, stream: 'stdout' | 'stderr'): StreamLogEvent {
  const normalized = line.trim()
  const lowerLine = normalized.toLowerCase()

  if (stream === 'stderr') {
    if (isMcpLifecycleLine(lowerLine)) {
      return {
        level: TASK_LOG_LEVEL.INFO,
        kind: TASK_LOG_KIND.MCP,
        source: TASK_LOG_SOURCE.AGENT,
        message: normalized,
      }
    }

    if (isMcpWarningLine(lowerLine)) {
      return {
        level: TASK_LOG_LEVEL.WARNING,
        kind: TASK_LOG_KIND.WARNING,
        source: TASK_LOG_SOURCE.AGENT,
        message: normalized,
      }
    }

    const errorLike =
      lowerLine.includes('error') ||
      lowerLine.includes('failed') ||
      lowerLine.includes('fatal') ||
      lowerLine.includes('exception') ||
      lowerLine.includes('unexpected argument') ||
      lowerLine.includes('not found')

    if (
      lowerLine.includes('warning') ||
      lowerLine.includes('retry') ||
      lowerLine.includes('quota')
    ) {
      return {
        level: TASK_LOG_LEVEL.WARNING,
        kind: TASK_LOG_KIND.WARNING,
        source: TASK_LOG_SOURCE.AGENT,
        message: normalized,
      }
    }

    if (errorLike) {
      return {
        level: TASK_LOG_LEVEL.ERROR,
        kind: TASK_LOG_KIND.ERROR,
        source: TASK_LOG_SOURCE.AGENT,
        message: normalized,
      }
    }

    return {
      level: TASK_LOG_LEVEL.INFO,
      kind: TASK_LOG_KIND.AGENT_MESSAGE,
      source: TASK_LOG_SOURCE.AGENT,
      message: normalized,
    }
  }

  if (isDiffLine(normalized)) {
    return {
      level: TASK_LOG_LEVEL.INFO,
      kind: TASK_LOG_KIND.FILE_CHANGE,
      source: TASK_LOG_SOURCE.AGENT,
      message: normalized,
      groupId: buildGroupId(TASK_LOG_KIND.FILE_CHANGE, normalized),
    }
  }

  if (normalized.startsWith('$ ') || normalized.startsWith('> ')) {
    return {
      level: TASK_LOG_LEVEL.INFO,
      kind: TASK_LOG_KIND.COMMAND,
      source: TASK_LOG_SOURCE.AGENT,
      message: normalized,
      groupId: 'command-output',
    }
  }

  return {
    level: TASK_LOG_LEVEL.INFO,
    kind: TASK_LOG_KIND.AGENT_MESSAGE,
    source: TASK_LOG_SOURCE.AGENT,
    message: normalized,
  }
}
