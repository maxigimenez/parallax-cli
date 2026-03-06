export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELED'
export enum TaskPlanState {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PLAN_GENERATING = 'PLAN_GENERATING',
  PLAN_READY = 'PLAN_READY',
  PLAN_REQUIRES_CLARIFICATION = 'PLAN_REQUIRES_CLARIFICATION',
  PLAN_APPROVED = 'PLAN_APPROVED',
  PLAN_REJECTED = 'PLAN_REJECTED',
  PLAN_FAILED = 'PLAN_FAILED',
}

export enum PlanResultStatus {
  PLAN_READY = 'PLAN_READY',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
  PLAN_FAILED = 'PLAN_FAILED',
}

export type PlanPromptType = 'PLAN' | 'IMPLEMENTATION' | 'REVIEW_FIX' | 'REVIEW_CONFLICT'

export type TaskReviewState =
  | 'NONE'
  | 'WAITING_FOR_REVIEW'
  | 'REVIEW_PENDING'
  | 'SYNCING_MAIN'
  | 'RESOLVING_CONFLICTS'
  | 'APPLYING_REVIEW'
  | 'REVISION_PUSHED'

export interface Task {
  id: string
  externalId: string
  title: string
  description: string
  status: TaskStatus
  projectId: string
  planState?: TaskPlanState
  planMarkdown?: string
  planPrompt?: string
  planResult?: string
  approvedBy?: string
  approvedAt?: number
  executionAttempts?: number
  lastAgent?: string
  branchName?: string
  prUrl?: string
  prNumber?: number
  lastReviewEventAt?: string
  reviewState?: TaskReviewState
  createdAt: number
  updatedAt: number
}

export interface ProjectConfig {
  id: string
  workspaceDir: string // Absolute path to existing local repo
  pullFrom: {
    provider: 'linear' | 'github'
    filters: {
      team?: string
      state?: string
      labels?: string[]
      project?: string
      owner?: string
      repo?: string
    }
  }
  agent: {
    provider: 'gemini' | 'claude-code' | 'codex'
    model?: string
    approvalMode?: 'default' | 'auto_edit'
    sandbox?: boolean
    disableMcp?: boolean
    allowedTools?: string[]
    extraArgs?: string[]
  }
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success'

export interface AppConfig {
  projects: ProjectConfig[]
  concurrency: number
  logs: LogLevel[] // Replaces logLevel
}

export interface AgentResult {
  success: boolean
  output: string
  error?: string
  prTitle?: string
  prSummary?: string
  planMarkdown?: string
}

export interface PlanResult {
  success: boolean
  status: PlanResultStatus
  output: string
  planMarkdown?: string
  planPrompt?: string
  summary?: string
  error?: string
}

export interface Logger {
  info: (msg: string, taskId?: string) => void
  success: (msg: string, taskId?: string) => void
  warn: (msg: string, taskId?: string) => void
  error: (msg: string, taskId?: string) => void
}

export function createTaskId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  const timestamp = Date.now().toString(36).slice(-4)
  return `${timestamp}${random}`.slice(0, 10)
}

export * from './executor.js'
