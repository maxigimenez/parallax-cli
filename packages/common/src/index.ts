export const TASK_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS]

export const TASK_RUNTIME_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const

export type TaskRuntimeStatus = (typeof TASK_RUNTIME_STATUS)[keyof typeof TASK_RUNTIME_STATUS]
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

export const PLAN_PROMPT_TYPE = {
  PLAN: 'PLAN',
  IMPLEMENTATION: 'IMPLEMENTATION',
  REVIEW_FIX: 'REVIEW_FIX',
  REVIEW_CONFLICT: 'REVIEW_CONFLICT',
} as const

export type PlanPromptType = (typeof PLAN_PROMPT_TYPE)[keyof typeof PLAN_PROMPT_TYPE]

export const TASK_REVIEW_STATE = {
  NONE: 'NONE',
  WAITING_FOR_REVIEW: 'WAITING_FOR_REVIEW',
  REVIEW_PENDING: 'REVIEW_PENDING',
  SYNCING_MAIN: 'SYNCING_MAIN',
  RESOLVING_CONFLICTS: 'RESOLVING_CONFLICTS',
  APPLYING_REVIEW: 'APPLYING_REVIEW',
  REVISION_PUSHED: 'REVISION_PUSHED',
} as const

export type TaskReviewState = (typeof TASK_REVIEW_STATE)[keyof typeof TASK_REVIEW_STATE]

export const PULL_PROVIDER = {
  LINEAR: 'linear',
  GITHUB: 'github',
} as const

export type PullProvider = (typeof PULL_PROVIDER)[keyof typeof PULL_PROVIDER]

export const AGENT_PROVIDER = {
  GEMINI: 'gemini',
  CLAUDE_CODE: 'claude-code',
  CODEX: 'codex',
} as const

export type AgentProvider = (typeof AGENT_PROVIDER)[keyof typeof AGENT_PROVIDER]

export const APPROVAL_MODE = {
  DEFAULT: 'default',
  AUTO_EDIT: 'auto_edit',
} as const

export type ApprovalMode = (typeof APPROVAL_MODE)[keyof typeof APPROVAL_MODE]

export const LOG_LEVEL = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SUCCESS: 'success',
} as const

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL]

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
  envFilePath?: string
  pullFrom: {
    provider: PullProvider
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
    provider: AgentProvider
    model?: string
    approvalMode: ApprovalMode
    sandbox: boolean
    disableMcp: boolean
    allowedTools?: string[]
    extraArgs?: string[]
  }
}

export interface ServerConfig {
  apiPort: number
  uiPort: number
}

export const DEFAULT_API_PORT = 3000
export const DEFAULT_UI_PORT = 8080
export const DEFAULT_CONCURRENCY = 2

export interface AppConfig {
  projects: ProjectConfig[]
  concurrency: number
  logs: LogLevel[] // Replaces logLevel
  server: ServerConfig
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

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
