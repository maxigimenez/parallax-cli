import { RUN_LOG_KIND, RUN_LOG_LEVEL, RUN_LOG_SOURCE, type RunLogEntry } from '@sentinel0/common'
import type { HermesStreamEvent } from './types.js'

/**
 * Maps Hermes SSE events onto Sentinel0 run-log entries.
 *
 * The exact event names Hermes emits are an open assumption (plan M0), so this
 * deliberately matches on a normalized suffix rather than exact strings, and
 * falls back to a generic entry instead of dropping anything it does not
 * recognize. An unknown event showing up as an INFO line is a much better
 * failure mode than silence while debugging a live run.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Pulls human-readable text out of the several shapes Hermes uses for it. */
export function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('')
  }

  const record = asRecord(value)
  for (const key of ['text', 'delta', 'content', 'message', 'output', 'summary']) {
    if (key in record) {
      const nested = extractText(record[key])
      if (nested) {
        return nested
      }
    }
  }
  return ''
}

/** `tool.started` -> `started`, `hermes.tool.progress` -> `progress`. */
function suffix(eventName: string): string {
  const parts = eventName.toLowerCase().split(/[.:]/)
  return parts[parts.length - 1] ?? ''
}

function family(eventName: string): string {
  const lower = eventName.toLowerCase()
  if (lower.includes('subagent')) {
    return 'subagent'
  }
  if (lower.includes('tool')) {
    return 'tool'
  }
  if (lower.includes('assistant') || lower.includes('output_text')) {
    return 'assistant'
  }
  if (lower.includes('reason') || lower.includes('thinking')) {
    return 'reasoning'
  }
  if (lower.includes('error')) {
    return 'error'
  }
  if (lower.includes('run') || lower.includes('response')) {
    return 'run'
  }
  return 'other'
}

function entry(
  partial: Pick<RunLogEntry, 'message' | 'icon' | 'kind'> & Partial<RunLogEntry>,
  now: number
): RunLogEntry {
  return {
    level: RUN_LOG_LEVEL.INFO,
    source: RUN_LOG_SOURCE.AGENT,
    timestamp: now,
    ...partial,
  }
}

export function mapHermesEvent(
  event: HermesStreamEvent,
  now: number = Date.now()
): RunLogEntry | null {
  const data = asRecord(event.data)
  const kindSuffix = suffix(event.event)

  switch (family(event.event)) {
    case 'tool': {
      const toolName = str(data.name) ?? str(data.tool_name) ?? str(data.tool) ?? 'tool'
      const detail = extractText(data.arguments ?? data.input ?? data.result ?? data.output)

      // Progress pings fire constantly and carry no payload worth a log line.
      if (kindSuffix === 'progress' && !detail) {
        return null
      }

      const finished = kindSuffix === 'completed' || kindSuffix === 'done'
      return entry(
        {
          title: toolName,
          message: detail || (finished ? 'completed' : 'started'),
          icon: finished ? '✓' : '⚙',
          kind: RUN_LOG_KIND.COMMAND,
          groupId: str(data.call_id) ?? str(data.id),
        },
        now
      )
    }

    case 'subagent': {
      const name = str(data.name) ?? str(data.agent) ?? 'subagent'
      const finished = kindSuffix === 'complete' || kindSuffix === 'completed'
      return entry(
        {
          title: name,
          message: extractText(data.summary ?? data.output) || (finished ? 'finished' : 'started'),
          icon: finished ? '✓' : '⑂',
          kind: RUN_LOG_KIND.SUBAGENT,
          groupId: str(data.subagent_id) ?? str(data.id),
        },
        now
      )
    }

    case 'assistant': {
      const text = extractText(data.delta ?? data.text ?? data.content ?? event.data)
      if (!text.trim()) {
        return null
      }
      return entry({ message: text, icon: '💬', kind: RUN_LOG_KIND.AGENT_MESSAGE }, now)
    }

    case 'reasoning': {
      const text = extractText(data.delta ?? data.text ?? data.content ?? event.data)
      if (!text.trim()) {
        return null
      }
      return entry({ message: text, icon: '🤔', kind: RUN_LOG_KIND.REASONING }, now)
    }

    case 'error': {
      return entry(
        {
          message: extractText(data.message ?? data.error ?? event.data) || event.event,
          icon: '✗',
          kind: RUN_LOG_KIND.ERROR,
          level: RUN_LOG_LEVEL.ERROR,
        },
        now
      )
    }

    case 'run': {
      // Completion is decided by polling getRun, not by this stream, so run
      // lifecycle events are informational only.
      const status = str(data.status) ?? kindSuffix
      return entry(
        {
          title: 'run',
          message: status,
          icon: '•',
          kind: RUN_LOG_KIND.LIFECYCLE,
          source: RUN_LOG_SOURCE.HERMES,
        },
        now
      )
    }

    default: {
      const text = extractText(event.data)
      if (!text.trim()) {
        return null
      }
      return entry(
        {
          title: event.event,
          message: text,
          icon: '·',
          kind: RUN_LOG_KIND.LIFECYCLE,
          source: RUN_LOG_SOURCE.HERMES,
        },
        now
      )
    }
  }
}
