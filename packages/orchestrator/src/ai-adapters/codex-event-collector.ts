import {
  TASK_LOG_KIND,
  TASK_LOG_LEVEL,
  TASK_LOG_SOURCE,
  type Logger,
  type Task,
} from '@parallax/common'

type CodexEvent = {
  type?: string
  item?: Record<string, unknown>
  [key: string]: unknown
}

type CodexCollectorMode = 'plan' | 'task'

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
      extractTextContent(record.output)
    )
  }

  return undefined
}

function isBenignTransportLine(lowerLine: string) {
  return (
    lowerLine.startsWith('openai codex ') ||
    lowerLine === '--------' ||
    lowerLine.startsWith('workdir:') ||
    lowerLine.startsWith('model:') ||
    lowerLine.startsWith('provider:') ||
    lowerLine.startsWith('approval:') ||
    lowerLine.startsWith('sandbox:') ||
    lowerLine.startsWith('reasoning effort:') ||
    lowerLine.startsWith('reasoning summaries:') ||
    lowerLine.startsWith('session id:') ||
    lowerLine === 'user' ||
    lowerLine.startsWith('warning: proceeding, even though we could not update path') ||
    lowerLine.includes('failed to read backfill state') ||
    lowerLine.includes('failed to create shell snapshot') ||
    lowerLine.includes('attempt to write a readonly database') ||
    lowerLine.includes('system-configuration') ||
    lowerLine.includes('state db record_discrepancy')
  )
}

function isMcpLine(lowerLine: string) {
  return lowerLine.startsWith('mcp:')
}

function isMcpWarningLine(lowerLine: string) {
  return (
    isMcpLine(lowerLine) &&
    (lowerLine.includes('failed') ||
      lowerLine.includes('invalid token') ||
      lowerLine.includes('not logged in') ||
      lowerLine.includes('authrequirederror') ||
      lowerLine.includes('transport channel closed'))
  )
}

function isPromptEchoLine(task: Task, lowerLine: string) {
  const promptLines = [
    'you are running plan mode for a coding task.',
    'return plain text only (no json, no markdown code fences).',
    'then include:',
    'plan:',
    '- step 1',
    '- step 2',
    'task id:',
    task.externalId.toLowerCase(),
    'title:',
    task.title.toLowerCase(),
    'description:',
    'rules:',
    '- no tool calls.',
    '- no shell commands.',
    '- keep plan concise and actionable.',
    '- do not use placeholder bullets like "step 1", "step 2", "tbd", or "..."',
  ]

  if (promptLines.includes(lowerLine)) {
    return true
  }

  return task.description
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
    .includes(lowerLine)
}

type FileChange = {
  path: string
  kind?: string
}

export class CodexEventCollector {
  private finalMessage: string | undefined
  private changedFiles = new Map<string, FileChange>()

  constructor(
    private logger: Logger,
    private task: Task,
    private mode: CodexCollectorMode
  ) {}

  private emitBlock(args: {
    title: string
    message: string
    kind: typeof TASK_LOG_KIND[keyof typeof TASK_LOG_KIND]
    level?: typeof TASK_LOG_LEVEL[keyof typeof TASK_LOG_LEVEL]
    source?: typeof TASK_LOG_SOURCE[keyof typeof TASK_LOG_SOURCE]
  }) {
    this.logger.event({
      taskId: this.task.id,
      title: args.title,
      message: args.message,
      kind: args.kind,
      level: args.level ?? TASK_LOG_LEVEL.INFO,
      source: args.source ?? TASK_LOG_SOURCE.AGENT,
    })
  }

  private handleCommandExecution(item: Record<string, unknown>) {
    const command = extractTextContent(item.command) ?? 'Command'
    const output = extractTextContent(item.aggregated_output) ?? extractTextContent(item.output) ?? '(no output)'
    const exitCode =
      typeof item.exit_code === 'number'
        ? item.exit_code
        : typeof item.exitCode === 'number'
          ? item.exitCode
          : undefined

    this.emitBlock({
      title: command,
      message: output,
      kind: TASK_LOG_KIND.COMMAND,
      level: exitCode && exitCode !== 0 ? TASK_LOG_LEVEL.WARNING : TASK_LOG_LEVEL.INFO,
      source: TASK_LOG_SOURCE.AGENT,
    })
  }

  private handleAssistantMessage(item: Record<string, unknown>) {
    const message =
      extractTextContent(item.text) ??
      extractTextContent(item.content) ??
      extractTextContent(item.message)

    if (!message) {
      return
    }

    this.finalMessage = message

    this.emitBlock({
      title: this.mode === 'plan' ? 'Plan response' : 'Agent summary',
      message,
      kind: TASK_LOG_KIND.RESULT,
      source: TASK_LOG_SOURCE.AGENT,
    })
  }

  private handleReasoning(item: Record<string, unknown>) {
    const message = extractTextContent(item.text) ?? extractTextContent(item.summary)
    if (!message) {
      return
    }

    this.emitBlock({
      title: 'Agent reasoning',
      message,
      kind: TASK_LOG_KIND.REASONING,
      source: TASK_LOG_SOURCE.AGENT,
    })
  }

  private handleMcpToolCall(item: Record<string, unknown>) {
    const server = extractTextContent(item.server) ?? 'unknown'
    const tool = extractTextContent(item.tool) ?? 'unknown'
    const status = extractTextContent(item.status) ?? 'invoked'

    this.emitBlock({
      title: `MCP ${server}/${tool}`,
      message: status,
      kind: TASK_LOG_KIND.MCP,
      source: TASK_LOG_SOURCE.AGENT,
    })
  }

  private handleFileChange(item: Record<string, unknown>) {
    const changes = Array.isArray(item.changes) ? item.changes : []
    for (const change of changes) {
      if (!change || typeof change !== 'object') {
        continue
      }
      const record = change as Record<string, unknown>
      const path = extractTextContent(record.path)
      if (!path) {
        continue
      }
      this.changedFiles.set(path, {
        path,
        kind: extractTextContent(record.kind),
      })
    }
  }

  private handleItemCompleted(item: Record<string, unknown>) {
    const handlers: Record<string, (item: Record<string, unknown>) => void> = {
      command_execution: (value) => this.handleCommandExecution(value),
      file_change: (value) => this.handleFileChange(value),
      assistant_message: (value) => this.handleAssistantMessage(value),
      agent_message: (value) => this.handleAssistantMessage(value),
      reasoning: (value) => this.handleReasoning(value),
      mcp_tool_call: (value) => this.handleMcpToolCall(value),
    }

    const itemType = extractTextContent(item.type)
    if (!itemType) {
      return
    }

    handlers[itemType]?.(item)
  }

  handleStdoutLine(line: string) {
    const normalized = normalizeLine(line)
    if (!normalized) {
      return
    }

    try {
      const event = JSON.parse(normalized) as CodexEvent
      if (event.type === 'item.completed' && event.item && typeof event.item === 'object') {
        this.handleItemCompleted(event.item)
      }
    } catch {
      // Ignore non-JSON stdout in json mode.
    }
  }

  handleStderrLine(line: string) {
    const normalized = normalizeLine(line)
    if (!normalized) {
      return
    }

    const lowerLine = normalized.toLowerCase()
    if (isBenignTransportLine(lowerLine)) {
      return
    }

    if (this.mode === 'plan' && isPromptEchoLine(this.task, lowerLine)) {
      return
    }

    if (isMcpWarningLine(lowerLine)) {
      this.emitBlock({
        title: 'MCP setup warning',
        message: normalized,
        kind: TASK_LOG_KIND.WARNING,
        level: TASK_LOG_LEVEL.WARNING,
        source: TASK_LOG_SOURCE.AGENT,
      })
      return
    }

    if (isMcpLine(lowerLine)) {
      this.emitBlock({
        title: 'MCP setup',
        message: normalized,
        kind: TASK_LOG_KIND.MCP,
        source: TASK_LOG_SOURCE.AGENT,
      })
      return
    }

    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('fatal')) {
      this.emitBlock({
        title: 'Codex stderr',
        message: normalized,
        kind: TASK_LOG_KIND.ERROR,
        level: TASK_LOG_LEVEL.ERROR,
        source: TASK_LOG_SOURCE.AGENT,
      })
      return
    }

    this.emitBlock({
      title: 'Codex stderr',
      message: normalized,
      kind: TASK_LOG_KIND.WARNING,
      level: TASK_LOG_LEVEL.WARNING,
      source: TASK_LOG_SOURCE.AGENT,
    })
  }

  getResult() {
    return {
      finalMessage: this.finalMessage ?? '',
      changedFiles: Array.from(this.changedFiles.values()),
    }
  }
}
