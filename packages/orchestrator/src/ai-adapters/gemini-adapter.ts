import { Task, ProjectConfig, AgentResult, Logger, PlanResult, PlanResultStatus } from '@parallax/common'
import { BaseAgentAdapter } from './base-adapter.js'

interface ParsedPlanOutput {
  status: string
  scope?: string
  assumptions?: string[]
  proposed_file_changes?: Array<{ path: string; operation?: string }>
  steps?: Array<{ step: number; action: string }>
  risk_log?: string[]
  validation?: string[]
  stop_conditions?: string[]
  questions?: string[]
  planMarkdown?: string
}

export class GeminiAdapter extends BaseAgentAdapter {
  constructor(executor: any, logger: Logger) {
    super(executor, logger)
  }

  private buildSharedInstructions(): string[] {
    return [
      'Use only tools that are actually available in this Gemini session.',
      'Do not rely on todo-planning tools such as write_todos.',
      'Do not start long-running development servers or watchers such as npm run dev, pnpm dev, vite, nuxt dev, next dev, or similar commands.',
      'If a command fails because dependencies are missing, detect the package manager from lockfiles and install dependencies only when needed.',
      'Avoid unnecessary installs when the repository already has working dependencies.',
    ]
  }

  private formatInstructions(instructions: string[]): string {
    return instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')
  }

  private extractPrMetadata(output: string): { prTitle?: string; prSummary?: string } {
    const titleMatch = output.match(/PARALLAX_PR_TITLE:\s*(.+)/i)
    const summaryMatch = output.match(/PARALLAX_PR_SUMMARY:\s*([\s\S]*?)(?:\nPARALLAX_|$)/i)

    const prTitle = titleMatch?.[1]?.trim()
    const prSummary = summaryMatch?.[1]?.trim()

    return {
      prTitle: prTitle || undefined,
      prSummary: prSummary || undefined,
    }
  }

  private handleLogChunk(task: Task, chunk: { stream: 'stdout' | 'stderr'; line: string }) {
    const line = chunk.line.trim()
    if (!line) {
      return
    }

    if (chunk.stream === 'stderr') {
      const lowerLine = line.toLowerCase()
      if (
        lowerLine.includes('warning') ||
        lowerLine.includes('quota') ||
        lowerLine.includes('retrying')
      ) {
        this.logger.warn(line, task.id)
      } else {
        this.logger.error(line, task.id)
      }
    } else {
      this.logger.info(line, task.id)
    }
  }

  private buildCommand(task: Task, project: ProjectConfig, prompt: string): string[] {
    const command = ['gemini']

    if (project.agent.model) {
      command.push('--model', project.agent.model)
    }

    const approvalMode = project.agent.approvalMode
    command.push('--approval-mode', approvalMode)

    if (project.agent.sandbox) {
      command.push('--sandbox')
    }

    if (project.agent.allowedTools?.length) {
      command.push('--allowed-tools', project.agent.allowedTools.join(','))
    }

    if (project.agent.extraArgs?.length) {
      command.push(...project.agent.extraArgs)
    }

    command.push('--prompt', prompt)

    this.logger.info(
      `Gemini command profile: approval=${approvalMode}, sandbox=${project.agent.sandbox ? 'on' : 'off'}`,
      task.id
    )

    return command
  }

  private parsePlanOutput(output: string): PlanResult {
    const trimmed = output.trim()
    if (!trimmed) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: trimmed,
        error: 'Empty plan output from Gemini.',
      }
    }

    const fenced = trimmed.match(/```json\n([\s\S]*?)\n```/i)
    const raw = fenced?.[1] || trimmed.match(/\{[\s\S]*\}/)?.[0] || ''

    if (!raw) {
      return {
        success: false,
        status: PlanResultStatus.PLAN_FAILED,
        output: trimmed,
        error: 'Could not locate JSON payload in plan output.',
      }
    }

    try {
      const parsed = JSON.parse(raw) as ParsedPlanOutput

      if (!isPlanStatus(parsed.status)) {
        return {
          success: false,
          status: PlanResultStatus.PLAN_FAILED,
          output: trimmed,
          error: `Invalid plan status: ${parsed.status || 'missing'}`,
        }
      }

      if (parsed.status === PlanResultStatus.PLAN_READY) {
        return {
          success: true,
          status: PlanResultStatus.PLAN_READY,
          output: trimmed,
          planMarkdown: this.normalizePlan(parsed),
          summary: parsed.scope,
          planPrompt: this.buildPlanPromptTemplate(),
        }
      }

      return {
        success: parsed.status !== PlanResultStatus.PLAN_FAILED,
        status: parsed.status,
        output: trimmed,
        planMarkdown: this.normalizePlan(parsed),
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

  private normalizePlan(parsed: ParsedPlanOutput): string {
    const payload = {
      status: parsed.status,
      scope: parsed.scope || 'Not specified.',
      assumptions: parsed.assumptions || [],
      proposed_file_changes: parsed.proposed_file_changes || [],
      steps: parsed.steps || [],
      risk_log: parsed.risk_log || [],
      validation: parsed.validation || [],
      stop_conditions: parsed.stop_conditions || [],
      questions: parsed.questions || [],
    }

    return JSON.stringify(payload, null, 2)
  }

  private buildPlanPrompt(task: Task): string {
    const instructions = [
      'You are generating an implementation plan, not executing code.',
      'No tool usage is allowed in this pass.',
      'Do not include implementation details that require additional discovery.',
      'Output JSON only, strictly matching this schema:',
      '{',
      `  "status": "${Object.values(PlanResultStatus).join('|')}",`,
      '  "scope": "What is changing, no more than 3 bullets.",',
      '  "assumptions": ["..."]',
      '  "proposed_file_changes": [{"path": "src/file.ts", "operation": "create|modify|delete"}]',
      '  "steps": [{"step": 1, "action": "Do this step"}]',
      '  "risk_log": ["..."]',
      '  "validation": ["..."]',
      '  "stop_conditions": ["..."]',
      '  "questions": ["...only if clarifications are required"]',
      '}',
      'Behavioral constraints:',
      '- Max 1200 words in scope and assumptions combined.',
      `- If certainty < 90%, set status to ${PlanResultStatus.NEEDS_CLARIFICATION} and provide questions.`,
      '- Do not propose full refactors or speculative architecture changes.',
      '- Do not include shell commands.',
      `- Return ${PlanResultStatus.PLAN_FAILED} only when execution is impossible without unsafe assumptions.`,
    ]

    return `\nTask ID: ${task.externalId}\nTitle: ${task.title}\n\nDescription:\n${task.description}\n\nInstructions:\n${this.formatInstructions(instructions)}`.trim()
  }

  private buildPlanPromptTemplate() {
    return [
      'JSON-only plan schema with status, scope, assumptions, proposed_file_changes, steps, risk_log, validation, stop_conditions, questions.',
      'No shell output, no markdown wrapper, no prose.',
    ].join('\n')
  }

  private constructExecutionPrompt(task: Task, approvedPlan?: string): string {
    const instructions = [
      'Implement only the plan that was approved. Do not expand scope.',
      'Run only the tests/checks needed to validate the changed area.',
      'Use only lightweight checks by default and keep changes minimal.',
      'If a required item is blocked, stop and report BLOCKED with a single next question.',
      'Do not redo issue discovery and do not create extra files not needed by the plan.',
      'Keep PR context focused on changed files only.',
      ...this.buildSharedInstructions(),
      'At the end of your response, include:',
      'PARALLAX_PR_TITLE: <short reviewer-facing title, no task ID prefix>',
      'PARALLAX_PR_SUMMARY:',
      '- <key change 1>',
      '- <key change 2>',
      '- <tests/validation performed>',
    ]

    const planHint = approvedPlan ? `\n\nApproved plan:\n${approvedPlan}` : ''

    return `\nTask ID: ${task.externalId}\nTitle: ${task.title}\n\nDescription:\n${task.description}${planHint}\n\nInstructions:\n${this.formatInstructions(instructions)}`.trim()
  }

  async runPlan(task: Task, workingDir: string, project: ProjectConfig): Promise<PlanResult> {
    try {
      await this.setupWorkspace(task, workingDir)
      const prompt = this.buildPlanPrompt(task)
      const command = this.buildCommand(task, project, prompt)
      const result = await this.executor.executeCommand(command, {
        cwd: workingDir,
        onData: (chunk) => this.handleLogChunk(task, chunk),
      })

      if (result.exitCode === 127) {
        return {
          success: false,
          status: PlanResultStatus.PLAN_FAILED,
          output: result.output,
          error:
            'Gemini CLI not found. Please ensure it is installed: npm install -g @google/gemini-cli',
        }
      }

      return this.parsePlanOutput(result.output)
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
    approvedPlan?: string
  ): Promise<AgentResult> {
    try {
      await this.setupWorkspace(task, workingDir)
      return this.executeAgent(
        task,
        workingDir,
        project,
        this.constructExecutionPrompt(task, approvedPlan),
        true
      )
    } catch (error: any) {
      return { success: false, output: '', error: error.message }
    }
  }

  async runReviewFixPass(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    review: { prUrl: string; branchName: string; baseBranch: string; feedback: string }
  ): Promise<AgentResult> {
    return this.executeAgent(task, workingDir, project, this.constructReviewPrompt(task, review))
  }

  async runMergeConflictResolution(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    review: { prUrl: string; branchName: string; baseBranch: string }
  ): Promise<AgentResult> {
    return this.executeAgent(task, workingDir, project, this.constructConflictPrompt(task, review))
  }

  private async executeAgent(
    task: Task,
    workingDir: string,
    project: ProjectConfig,
    prompt: string,
    extractPrMetadata = false
  ): Promise<AgentResult> {
    const command = this.buildCommand(task, project, prompt)

    const result = await this.executor.executeCommand(command, {
      cwd: workingDir,
      onData: (chunk) => this.handleLogChunk(task, chunk),
    })

    if (result.exitCode === 127) {
      return {
        success: false,
        output: result.output,
        error:
          'Gemini CLI not found. Please ensure it is installed: npm install -g @google/gemini-cli',
      }
    }

    return {
      success: result.exitCode === 0,
      output: result.output,
      ...(extractPrMetadata ? this.extractPrMetadata(result.output) : {}),
      error: result.exitCode !== 0 ? `Agent exited with code ${result.exitCode}` : undefined,
    }
  }

  private constructReviewPrompt(
    task: Task,
    review: { prUrl: string; branchName: string; baseBranch: string; feedback: string }
  ): string {
    const instructions = [
      'Analyze the codebase in the current directory.',
      'You are updating an existing pull request in response to review feedback.',
      `The current branch is ${review.branchName} and it targets ${review.baseBranch}.`,
      `The pull request URL is ${review.prUrl}.`,
      'Address only the review feedback listed below.',
      'Do not redo the full task. Do not broaden scope beyond the requested comments.',
      'Run the relevant lightweight quality checks before finishing, and fix any issues you introduce.',
      'Do not create a new branch or a new pull request.',
      'Treat the feedback comments as the source of truth for what to change.',
      ...this.buildSharedInstructions(),
    ]

    return `\nTask ID: ${task.externalId}\nTitle: ${task.title}\n\nReview feedback to address:\n${review.feedback}\n\nInstructions:\n${this.formatInstructions(instructions)}`.trim()
  }

  private constructConflictPrompt(
    task: Task,
    review: { prUrl: string; branchName: string; baseBranch: string }
  ): string {
    const instructions = [
      'Analyze the repository state and resolve the current git merge conflicts.',
      `You are on branch ${review.branchName} merging from ${review.baseBranch}.`,
      `The pull request URL is ${review.prUrl}.`,
      'Resolve conflicts carefully and preserve the intended task behavior.',
      'Do not create a new branch or a new pull request.',
      ...this.buildSharedInstructions(),
    ]

    return `\nTask ID: ${task.externalId}\nTitle: ${task.title}\n\nOriginal task description:\n${task.description}\n\nInstructions:\n${this.formatInstructions(instructions)}`.trim()
  }
}

function isPlanStatus(value: string): value is PlanResultStatus {
  return (
    value === PlanResultStatus.PLAN_READY ||
    value === PlanResultStatus.NEEDS_CLARIFICATION ||
    value === PlanResultStatus.PLAN_FAILED
  )
}
