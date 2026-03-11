import {
  APPROVAL_MODE,
  Task,
  ProjectConfig,
  AgentResult,
  Logger,
  PlanResult,
  PlanResultStatus,
} from '@parallax/common'
import { BaseAgentAdapter } from './base-adapter.js'
import { extractExecutionMetadata } from './execution-metadata.js'
import { CodexEventCollector } from './codex-event-collector.js'

interface CodexPlanOutput {
  status?: PlanResultStatus
  scope?: string
  assumptions?: string[]
  proposed_file_changes?: Array<{ path: string; operation?: string }>
  steps?: Array<{ step: number; action: string }>
  risk_log?: string[]
  validation?: string[]
  stop_conditions?: string[]
  questions?: string[]
  [key: string]: unknown
}

type TextPlanParse = {
  status: PlanResultStatus
  planMarkdown: string
  summary?: string
  error?: string
}

export class CodexAdapter extends BaseAgentAdapter {
  constructor(executor: any, logger: Logger) {
    super(executor, logger)
  }

  private resolveSandboxMode(project: ProjectConfig): 'workspace-write' | 'danger-full-access' {
    return project.agent.sandbox === false ? 'danger-full-access' : 'workspace-write'
  }

  private buildCommand(task: Task, project: ProjectConfig, prompt: string): string[] {
    const command = ['codex', 'exec']
    const sandboxMode = this.resolveSandboxMode(project)
    const autoEdit = project.agent.approvalMode === APPROVAL_MODE.AUTO_EDIT

    if (project.agent.model) {
      command.push('--model', project.agent.model)
    }

    if (project.agent.sandbox === false) {
      command.push('--dangerously-bypass-approvals-and-sandbox')
    } else if (autoEdit) {
      command.push('--full-auto')
    } else {
      command.push('--sandbox', sandboxMode)
    }

    if (project.agent.extraArgs?.length) {
      command.push(...project.agent.extraArgs)
    }

    if (project.agent.disableMcp) {
      command.push('-c', 'features.experimental_use_rmcp_client=false', '-c', 'mcp_servers={}')

      const knownServers = ['linear', 'nuxt', 'playwright', 'shadcn', 'notion']
      for (const server of knownServers) {
        command.push('-c', `mcp_servers.${server}.enabled=false`)
      }
    }

    command.push('--json')
    command.push('--', prompt)

    this.logger.info(
      `Codex command profile: model=${project.agent.model ?? 'default'}, approval=${project.agent.approvalMode}, sandbox=${sandboxMode}`,
      task.id
    )

    return command
  }

  private extractJsonCandidates(output: string): string[] {
    const candidates: string[] = []

    const fencedPattern = /```json\s*([\s\S]*?)```/gi
    let fencedMatch: RegExpExecArray | null = fencedPattern.exec(output)
    while (fencedMatch) {
      const payload = fencedMatch[1]?.trim()
      if (payload) {
        candidates.push(payload)
      }
      fencedMatch = fencedPattern.exec(output)
    }

    let start = -1
    let depth = 0
    let inString = false
    let escaped = false
    let opening = ''

    for (let i = 0; i < output.length; i += 1) {
      const char = output[i]

      if (start === -1 && (char === '{' || char === '[')) {
        start = i
        opening = char
        depth = 1
        inString = false
        escaped = false
        continue
      }

      if (start === -1) {
        continue
      }

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }

        if (char === '\\') {
          escaped = true
          continue
        }

        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{' || char === '[') {
        depth += 1
        continue
      }

      if (char === '}' || char === ']') {
        depth -= 1
        if (depth === 0) {
          const payload = output.slice(start, i + 1)
          if (
            (opening === '{' && payload.endsWith('}')) ||
            (opening === '[' && payload.endsWith(']'))
          ) {
            candidates.push(payload)
          }
          start = -1
          opening = ''
        }
      }
    }

    return candidates
  }

  private parsePlanPayload(output: string): unknown {
    const candidates = this.extractJsonCandidates(output)

    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(candidates[i])
      } catch {
        // Try older candidates.
      }
    }

    throw new Error('No valid JSON payload was found for plan output.')
  }

  private parseTextPlanOutput(output: string): TextPlanParse | undefined {
    const statusPattern =
      /(?:^|\n)\s*STATUS\s*:\s*(PLAN_READY|NEEDS_CLARIFICATION|PLAN_FAILED)\s*(?:\n|$)/gi
    let statusMatch: RegExpExecArray | null = statusPattern.exec(output)
    let lastStatusMatch: RegExpExecArray | null = null

    while (statusMatch) {
      lastStatusMatch = statusMatch
      statusMatch = statusPattern.exec(output)
    }

    if (!lastStatusMatch) {
      return undefined
    }

    const tail = output.slice(lastStatusMatch.index)
    const statusValue = lastStatusMatch[1].toUpperCase()
    const status = this.parsePlanStatus(statusValue)
    if (!status) {
      return undefined
    }

    const summaryMatch = tail.match(/(?:^|\n)\s*SUMMARY\s*:\s*(.+)\s*(?:\n|$)/i)
    const errorMatch = tail.match(/(?:^|\n)\s*(?:ERROR|BLOCKER)\s*:\s*(.+)\s*(?:\n|$)/i)
    const planSection = tail.match(/(?:^|\n)\s*PLAN\s*:\s*([\s\S]*)$/i)?.[1]
    const planMarkdown = (planSection || tail)
      .replace(/(?:^|\n)\s*STATUS\s*:\s*.+$/i, '')
      .replace(/(?:^|\n)\s*SUMMARY\s*:\s*.+$/i, '')
      .trim()

    return {
      status,
      planMarkdown: planMarkdown || output.trim(),
      summary: summaryMatch?.[1]?.trim(),
      error: errorMatch?.[1]?.trim(),
    }
  }

  private parsePlanOutput(output: string): PlanResult {
    const trimmed = output.trim()
    if (!trimmed) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: trimmed,
        error: 'Empty output from Codex.',
      }
    }

    const textPlan = this.parseTextPlanOutput(trimmed)
    if (textPlan) {
      return {
        success: textPlan.status !== PlanResultStatus.PLAN_FAILED,
        status: textPlan.status,
        output: trimmed,
        planMarkdown: textPlan.planMarkdown,
        planPrompt: this.buildPlanPromptTemplate(),
        summary: textPlan.summary,
        error: textPlan.error,
      }
    }

    try {
      const parsed = this.parsePlanPayload(trimmed)
      const normalized = this.normalizePlanOutput(parsed)
      if (!normalized.status) {
        return {
          success: false,
          status: PlanResultStatus.PLAN_FAILED,
          output: trimmed,
          error: normalized.error || 'Missing plan status field.',
        }
      }

      return {
        success: normalized.status !== PlanResultStatus.PLAN_FAILED,
        status: normalized.status,
        output: trimmed,
        planMarkdown: normalized.planMarkdown,
        planPrompt: this.buildPlanPromptTemplate(),
        summary: typeof normalized.scope === 'string' ? normalized.scope : undefined,
        error: normalized.error,
      }
    } catch (error) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: trimmed,
        error: error instanceof Error ? error.message : 'Invalid JSON output.',
      }
    }
  }

  private parsePlanStatus(rawStatus: string | undefined): PlanResultStatus | undefined {
    if (!rawStatus) {
      return undefined
    }

    return rawStatus === PlanResultStatus.PLAN_READY
      ? PlanResultStatus.PLAN_READY
      : rawStatus === PlanResultStatus.PLAN_FAILED
        ? PlanResultStatus.PLAN_FAILED
        : rawStatus === PlanResultStatus.NEEDS_CLARIFICATION
          ? PlanResultStatus.NEEDS_CLARIFICATION
          : undefined
  }

  private normalizePlanOutput(output: unknown): {
    status?: PlanResultStatus
    planMarkdown: string
    scope?: string
    error?: string
  } {
    if (typeof output !== 'object' || output === null) {
      return {
        status: PlanResultStatus.PLAN_FAILED,
        planMarkdown: '',
        error: 'Plan output is not an object.',
      }
    }

    const parsed = output as CodexPlanOutput
    const status = this.parsePlanStatus(parsed.status)
    const scope = parsed.scope || 'No scope provided.'

    if (!status) {
      return {
        status: undefined,
        planMarkdown: JSON.stringify(parsed, null, 2),
        scope,
        error: `Unknown status: ${(parsed.status as string) || 'missing'}`,
      }
    }

    return {
      status,
      planMarkdown: JSON.stringify({ ...parsed, status }, null, 2),
      scope,
    }
  }

  async runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult> {
    const command = this.buildCommand(task, project, this.buildPlanPrompt(task))
    const env = await this.resolveProjectEnv(project)
    const collector = new CodexEventCollector(this.logger, task, 'plan')

    const result = await this.executor.executeCommand(command, {
      cwd: workingDir,
      onData: (chunk) =>
        chunk.stream === 'stdout'
          ? collector.handleStdoutLine(chunk.line)
          : collector.handleStderrLine(chunk.line),
      env,
    })

    if (result.exitCode === 127) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: result.output,
        error: 'Codex CLI not found. Ensure `codex` is installed and available in PATH.',
      }
    }

    if (result.exitCode !== 0) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: result.output,
        error: `Codex exited with code ${result.exitCode}`,
      }
    }

    const { finalMessage } = collector.getResult()
    return this.parsePlanOutput(finalMessage || result.stdout || result.output)
  }

  async runTask(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    approvedPlan?: string,
    outputMode: 'pr' | 'commit' = 'pr'
  ): Promise<AgentResult> {
    if (approvedPlan && /(?:^|\n)\s*-\s*step\s+\d+\s*$/im.test(approvedPlan)) {
      return {
        success: false,
        output: approvedPlan,
        error:
          'Approved plan contains placeholders (for example, "- Step 1"). Provide concrete approved steps.',
      }
    }

    const command = this.buildCommand(
      task,
      project,
      this.buildExecutionPrompt(task, approvedPlan, outputMode)
    )
    const env = await this.resolveProjectEnv(project)
    const collector = new CodexEventCollector(this.logger, task, 'task')

    const result = await this.executor.executeCommand(command, {
      cwd: workingDir,
      onData: (chunk) =>
        chunk.stream === 'stdout'
          ? collector.handleStdoutLine(chunk.line)
          : collector.handleStderrLine(chunk.line),
      env,
    })

    if (result.exitCode === 127) {
      return {
        success: false,
        output: result.output,
        error: 'Codex CLI not found. Ensure `codex` is installed and available in PATH.',
      }
    }

    const { finalMessage } = collector.getResult()
    const parsedOutput = finalMessage || result.stdout || result.output

    return {
      success: result.exitCode === 0,
      output: parsedOutput,
      ...extractExecutionMetadata(parsedOutput),
      error: result.exitCode !== 0 ? `Codex exited with code ${result.exitCode}` : undefined,
    }
  }

  private buildPlanPrompt(task: Task): string {
    return [
      'You are running plan mode for a coding task.',
      'Return plain text only (no JSON, no markdown code fences).',
      `First line must be exactly: STATUS: ${PlanResultStatus.PLAN_READY}|${PlanResultStatus.NEEDS_CLARIFICATION}|${PlanResultStatus.PLAN_FAILED}`,
      'Second line should be: SUMMARY: <one sentence>',
      'Then include:',
      'PLAN:',
      '- Step 1',
      '- Step 2',
      '',
      `If status is ${PlanResultStatus.NEEDS_CLARIFICATION}, include a QUESTIONS: section with bullet points.`,
      `If status is ${PlanResultStatus.PLAN_FAILED}, include ERROR: <reason>.`,
      '',
      'Task ID:',
      task.externalId,
      'Title:',
      task.title,
      'Description:',
      task.description,
      'Rules:',
      '- No tool calls.',
      '- No shell commands.',
      '- Keep plan concise and actionable.',
      '- Do not use placeholder bullets like "Step 1", "Step 2", "TBD", or "..."',
    ].join('\n')
  }

  private buildPlanPromptTemplate() {
    return [
      'Plain-text planning schema with STATUS, SUMMARY, PLAN, optional QUESTIONS, and optional ERROR.',
      'No JSON, no markdown code fences, no tool calls, no shell commands.',
    ].join('\n')
  }

  private buildExecutionPrompt(task: Task, approvedPlan?: string, outputMode: 'pr' | 'commit' = 'pr'): string {
    const base = `Task ID: ${task.externalId}\nTitle: ${task.title}\nDescription:\n${task.description}`
    const planLine = approvedPlan ? `\n\nApproved Plan:\n${approvedPlan}` : ''
    const outputInstruction =
      outputMode === 'commit'
        ? 'At the end include a single-line commit message in PARALLAX_COMMIT_MESSAGE format.'
        : [
            'At the end include PR title and summary in PARALLAX_PR_TITLE and PARALLAX_PR_SUMMARY format.',
            'PARALLAX_PR_SUMMARY must be a concise human summary with maximum 10 lines.',
            'Do not include code, diffs, commands, file patches, stack traces, or raw output in PARALLAX_PR_SUMMARY.',
          ].join(' ')

    return [
      'You are executing an implementation plan.',
      'Only perform steps described in the approved plan and keep scope bounded.',
      'If blocked, return a short explanation and stop without guessing.',
      base,
      planLine,
      outputInstruction,
    ].join('\n')
  }
}
