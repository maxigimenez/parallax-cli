import {
  Task,
  ProjectConfig,
  AgentResult,
  Logger,
  PlanResult,
  PlanResultStatus,
} from '@parallax/common'
import { BaseAgentAdapter } from './base-adapter.js'
import { extractExecutionMetadata } from './execution-metadata.js'
import { ClaudeCodeEventCollector } from './claude-code-event-collector.js'

type TextPlanParse = {
  status: PlanResultStatus
  planMarkdown: string
  summary?: string
  error?: string
}

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  constructor(executor: any, logger: Logger) {
    super(executor, logger)
  }

  private buildCommand(task: Task, project: ProjectConfig, prompt: string): string[] {
    const command = ['claude']

    if (project.agent.model) {
      command.push('--model', project.agent.model)
    }

    command.push('--permission-mode', 'acceptEdits')
    command.push('--output-format', 'stream-json')
    command.push('--verbose')
    command.push('-p', prompt)

    this.logger.info(
      `Claude Code command profile: model=${project.agent.model ?? 'default'}, permission=acceptEdits, sandbox=managed`,
      task.id
    )

    return command
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
        error: 'Empty output from Claude Code.',
      }
    }

    const textPlan = this.parseTextPlanOutput(trimmed)
    if (!textPlan) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: trimmed,
        error: 'No valid plan schema was found in Claude Code output.',
      }
    }

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

  private buildPlanPrompt(task: Task): string {
    return [
      'You are running plan mode for a coding task.',
      'Return plain text only (no JSON, no markdown code fences).',
      `First line must be exactly: STATUS: ${PlanResultStatus.PLAN_READY}|${PlanResultStatus.NEEDS_CLARIFICATION}|${PlanResultStatus.PLAN_FAILED}`,
      'Second line should be: SUMMARY: <one sentence>',
      'Then include:',
      'PLAN:',
      '- Concrete step 1',
      '- Concrete step 2',
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
      '- No shell commands.',
      '- Keep plan concise and actionable.',
      '- Do not use placeholder bullets like "Step 1", "Step 2", "TBD", or "...".',
    ].join('\n')
  }

  private buildPlanPromptTemplate() {
    return [
      'Plain-text planning schema with STATUS, SUMMARY, PLAN, optional QUESTIONS, and optional ERROR.',
      'No JSON, no markdown code fences, no shell commands.',
    ].join('\n')
  }

  private buildExecutionPrompt(
    task: Task,
    approvedPlan?: string,
    outputMode: 'pr' | 'commit' = 'pr'
  ): string {
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

  private async executeClaudeCommand(
    workingDir: string,
    project: ProjectConfig,
    command: string[],
    collector: ClaudeCodeEventCollector
  ) {
    const env = await this.resolveProjectEnv(project)

    const result = await this.executor.executeCommand(command, {
      cwd: workingDir,
      onData: (chunk) =>
        chunk.stream === 'stdout'
          ? collector.handleStdoutLine(chunk.line)
          : collector.handleStderrLine(chunk.line),
      env,
    })

    return result
  }

  async runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult> {
    try {
      await this.setupWorkspace(task, workingDir)
      const command = this.buildCommand(task, project, this.buildPlanPrompt(task))
      const collector = new ClaudeCodeEventCollector(this.logger, task, 'plan')
      let result: any

      try {
        result = await this.executeClaudeCommand(workingDir, project, command, collector)
      } catch (e: any) {
        this.logger.error('DEBUG error running command', e)
      }

      if (result.exitCode === 127) {
        return {
          success: false,
          status: PlanResultStatus.PLAN_FAILED,
          output: result.output,
          error:
            'Claude Code CLI not found. Please ensure it is installed: npm install -g @anthropic-ai/claude-code',
        }
      }

      if (result.exitCode !== 0) {
        return {
          success: false,
          status: PlanResultStatus.PLAN_FAILED,
          output: result.output,
          error: `Claude Code exited with code ${result.exitCode}`,
        }
      }

      const { finalMessage } = collector.getResult()
      return this.parsePlanOutput(finalMessage || result.stdout || result.output)
    } catch (error: any) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: '',
        error: error.message,
      }
    }
  }

  async runTask(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    approvedPlan?: string,
    outputMode: 'pr' | 'commit' = 'pr'
  ): Promise<AgentResult> {
    try {
      await this.setupWorkspace(task, workingDir)
      const command = this.buildCommand(
        task,
        project,
        this.buildExecutionPrompt(task, approvedPlan, outputMode)
      )
      const collector = new ClaudeCodeEventCollector(this.logger, task, 'task')
      const result = await this.executeClaudeCommand(workingDir, project, command, collector)

      if (result.exitCode === 127) {
        return {
          success: false,
          output: result.output,
          error:
            'Claude Code CLI not found. Please ensure it is installed: npm install -g @anthropic-ai/claude-code',
        }
      }

      const { finalMessage } = collector.getResult()
      const parsedOutput = finalMessage || result.stdout || result.output

      return {
        success: result.exitCode === 0,
        output: parsedOutput,
        ...extractExecutionMetadata(parsedOutput),
        error:
          result.exitCode !== 0 ? `Claude Code exited with code ${result.exitCode}` : undefined,
      }
    } catch (error: any) {
      return { success: false, output: '', error: error.message }
    }
  }
}
