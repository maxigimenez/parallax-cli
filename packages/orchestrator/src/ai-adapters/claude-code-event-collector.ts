import {
  TASK_LOG_KIND,
  TASK_LOG_LEVEL,
  TASK_LOG_SOURCE,
  type Logger,
  type Task,
} from '@parallax/common'

type ClaudeStreamEvent = {
  type?: string
  subtype?: string
  message?: Record<string, unknown>
  content?: unknown
  result?: string
  session_id?: string
  is_error?: boolean
  [key: string]: unknown
}

function normalizeLine(value: string) {
  return value.replace(/[\uFFFD]/g, '').trim()
}

function extractTextContent(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractTextContent(entry))
      .filter((entry): entry is string => Boolean(entry))
    return parts.length > 0 ? parts.join('\n').trim() : undefined
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      extractTextContent(record.text) ??
      extractTextContent(record.content) ??
      extractTextContent(record.message) ??
      extractTextContent(record.result)
    )
  }

  return undefined
}

export class ClaudeCodeEventCollector {
  private finalMessage: string | undefined

  constructor(
    private logger: Logger,
    private task: Task,
    private mode: 'plan' | 'task'
  ) {}

  private emitBlock(args: {
    title: string
    message: string
    kind: typeof TASK_LOG_KIND[keyof typeof TASK_LOG_KIND]
    level?: typeof TASK_LOG_LEVEL[keyof typeof TASK_LOG_LEVEL]
  }) {
    this.logger.event({
      taskId: this.task.id,
      title: args.title,
      message: args.message,
      kind: args.kind,
      level: args.level ?? TASK_LOG_LEVEL.INFO,
      source: TASK_LOG_SOURCE.AGENT,
    })
  }

  private emitMessageContent(content: unknown) {
    if (!Array.isArray(content)) {
      const message = extractTextContent(content)
      if (!message) {
        return
      }

      this.emitBlock({
        title: this.mode === 'plan' ? 'Planning update' : 'Agent update',
        message,
        kind: TASK_LOG_KIND.AGENT_MESSAGE,
      })
      return
    }

    for (const item of content) {
      if (!item || typeof item !== 'object') {
        continue
      }

      const record = item as Record<string, unknown>
      const itemType = typeof record.type === 'string' ? record.type : ''

      const handlers: Record<string, () => void> = {
        text: () => {
          const message = extractTextContent(record.text)
          if (!message) {
            return
          }
          this.emitBlock({
            title: this.mode === 'plan' ? 'Planning update' : 'Agent update',
            message,
            kind: TASK_LOG_KIND.AGENT_MESSAGE,
          })
        },
        thinking: () => {
          const message = extractTextContent(record.thinking) ?? extractTextContent(record.text)
          if (!message) {
            return
          }
          this.emitBlock({
            title: 'Agent reasoning',
            message,
            kind: TASK_LOG_KIND.REASONING,
          })
        },
        tool_use: () => {
          const toolName = extractTextContent(record.name) ?? 'tool'
          const input = extractTextContent(record.input) ?? 'invoked'
          this.emitBlock({
            title: `Tool ${toolName}`,
            message: input,
            kind: TASK_LOG_KIND.COMMAND,
          })
        },
        tool_result: () => {
          const message = extractTextContent(record.content) ?? extractTextContent(record.result)
          if (!message) {
            return
          }
          this.emitBlock({
            title: 'Tool result',
            message,
            kind: TASK_LOG_KIND.COMMAND,
          })
        },
      }

      if (handlers[itemType]) {
        handlers[itemType]()
        continue
      }

      const message = extractTextContent(record)
      if (!message) {
        continue
      }

      this.emitBlock({
        title: this.mode === 'plan' ? 'Planning update' : 'Agent update',
        message,
        kind: TASK_LOG_KIND.AGENT_MESSAGE,
      })
    }
  }

  handleStdoutLine(line: string) {
    const normalized = normalizeLine(line)
    if (!normalized) {
      return
    }

    try {
      const event = JSON.parse(normalized) as ClaudeStreamEvent
      const type = typeof event.type === 'string' ? event.type : ''
      const subtype = typeof event.subtype === 'string' ? event.subtype : ''

      const handlers: Record<string, () => void> = {
        'system:init': () => {
          const sessionId = extractTextContent(event.session_id)
          if (!sessionId) {
            return
          }
          this.emitBlock({
            title: 'Claude session',
            message: `Session started: ${sessionId}`,
            kind: TASK_LOG_KIND.LIFECYCLE,
          })
        },
        assistant: () => {
          this.emitMessageContent(event.message?.content ?? event.content)
        },
        result: () => {
          const resultMessage = extractTextContent(event.result)
          if (!resultMessage) {
            return
          }
          this.finalMessage = resultMessage
          this.emitBlock({
            title: this.mode === 'plan' ? 'Plan response' : 'Agent summary',
            message: resultMessage,
            kind: TASK_LOG_KIND.RESULT,
            level: event.is_error ? TASK_LOG_LEVEL.ERROR : TASK_LOG_LEVEL.INFO,
          })
        },
      }

      const compoundType = subtype ? `${type}:${subtype}` : type
      if (handlers[compoundType]) {
        handlers[compoundType]()
        return
      }

      if (handlers[type]) {
        handlers[type]()
      }
    } catch {
      // Ignore non-JSON stdout in stream-json mode.
    }
  }

  handleStderrLine(line: string) {
    const normalized = normalizeLine(line)
    if (!normalized) {
      return
    }

    const lowerLine = normalized.toLowerCase()
    const level =
      lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('fatal')
        ? TASK_LOG_LEVEL.ERROR
        : TASK_LOG_LEVEL.WARNING

    this.emitBlock({
      title: 'Claude stderr',
      message: normalized,
      kind: level === TASK_LOG_LEVEL.ERROR ? TASK_LOG_KIND.ERROR : TASK_LOG_KIND.WARNING,
      level,
    })
  }

  getResult() {
    return {
      finalMessage: this.finalMessage,
    }
  }
}
