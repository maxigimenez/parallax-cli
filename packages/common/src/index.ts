// ─────────────────────────────────────────────────────────────
// Run lifecycle
// ─────────────────────────────────────────────────────────────

export const RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  AWAITING_APPROVAL: 'awaiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELED,
]

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status)
}

// ─────────────────────────────────────────────────────────────
// Ticket providers
// ─────────────────────────────────────────────────────────────

export const TICKET_PROVIDER = {
  LINEAR: 'linear',
  GITHUB: 'github',
} as const

export type TicketProvider = (typeof TICKET_PROVIDER)[keyof typeof TICKET_PROVIDER]

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

export const LOG_LEVEL = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SUCCESS: 'success',
} as const

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL]

export const RUN_LOG_LEVEL = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const

export type RunLogLevel = (typeof RUN_LOG_LEVEL)[keyof typeof RUN_LOG_LEVEL]

export const RUN_LOG_KIND = {
  LIFECYCLE: 'lifecycle',
  AGENT_MESSAGE: 'agent_message',
  REASONING: 'reasoning',
  COMMAND: 'command',
  FILE_CHANGE: 'file_change',
  SUBAGENT: 'subagent',
  MCP: 'mcp',
  WARNING: 'warning',
  ERROR: 'error',
  RESULT: 'result',
} as const

export type RunLogKind = (typeof RUN_LOG_KIND)[keyof typeof RUN_LOG_KIND]

export const RUN_LOG_SOURCE = {
  SYSTEM: 'system',
  AGENT: 'agent',
  HERMES: 'hermes',
  GITHUB: 'github',
  LINEAR: 'linear',
} as const

export type RunLogSource = (typeof RUN_LOG_SOURCE)[keyof typeof RUN_LOG_SOURCE]

export interface RunLogEntry {
  title?: string
  message: string
  icon: string
  level: RunLogLevel
  timestamp: number
  kind: RunLogKind
  source: RunLogSource
  groupId?: string
}

export interface Logger {
  info: (msg: string, runId?: string) => void
  success: (msg: string, runId?: string) => void
  warn: (msg: string, runId?: string) => void
  error: (msg: string, runId?: string) => void
  event: (entry: {
    runId: string
    title?: string
    message: string
    level?: RunLogLevel
    kind: RunLogKind
    source: RunLogSource
    icon?: string
    groupId?: string
  }) => void
}

// ─────────────────────────────────────────────────────────────
// Hermes agent inventory
// ─────────────────────────────────────────────────────────────

/**
 * A Hermes profile as discovered through its API server. This is what the
 * runner pushes to the cloud registry; it is derived state, never hand-edited.
 */
export interface AgentDescriptor {
  profile: string
  displayName?: string
  role?: string
  model?: string
  provider?: string
  toolsets: string[]
  skills: string[]
  githubLogin?: string
  enabled: boolean
  discoveredAt: number
}

// ─────────────────────────────────────────────────────────────
// Triggers
// ─────────────────────────────────────────────────────────────

export const TRIGGER_TYPE = {
  TICKET: 'ticket',
  PR_REVIEW_REQUESTED: 'pr_review_requested',
  PR_EVENT: 'pr_event',
  SCHEDULE: 'schedule',
  MANUAL: 'manual',
} as const

export type TriggerType = (typeof TRIGGER_TYPE)[keyof typeof TRIGGER_TYPE]

/**
 * A normalized "something happened" fact, produced by a trigger source and fed
 * to the rule engine. `revision` captures the mutable parts of the source
 * object so that re-observing an unchanged ticket does not re-fire a route.
 */
export interface TriggerEvent {
  type: TriggerType
  projectId: string
  provider: TicketProvider
  ref: string
  revision: string
  title: string
  body: string
  url?: string
  labels: string[]
  state?: string
  prNumber?: number
  requestedReviewers?: string[]
}

// ─────────────────────────────────────────────────────────────
// Routing rules
// ─────────────────────────────────────────────────────────────

/** Set predicate. `any` = OR, `all` = AND, `none` = NOR. Omitted keys are ignored. */
export interface StringSetMatch {
  any?: string[]
  all?: string[]
  none?: string[]
}

export interface RouteMatch {
  labels?: StringSetMatch
  state?: StringSetMatch
  titleMatches?: string
  bodyMatches?: string
}

export interface RouteTarget {
  agentRef: {
    profile?: string
    githubLogin?: string
  }
}

export interface RouteExecution {
  promptTemplate: string
  requireApproval: boolean
  modelOverride?: string | null
  timeoutSeconds: number
}

export const COMMENT_TARGET = {
  TICKET: 'ticket',
  PR: 'pr',
  NONE: 'none',
} as const

export type CommentTarget = (typeof COMMENT_TARGET)[keyof typeof COMMENT_TARGET]

export interface RouteOutcome {
  postComment?: { target: CommentTarget }
  labels?: { add?: string[]; remove?: string[] }
}

export interface RoutingRule {
  id: string
  name: string
  priority: number
  enabled: boolean
  trigger: {
    type: TriggerType
    provider?: TicketProvider
    projectId: string
  }
  match: RouteMatch
  target: RouteTarget
  execution: RouteExecution
  outcome: RouteOutcome
}

// ─────────────────────────────────────────────────────────────
// Runs
// ─────────────────────────────────────────────────────────────

export interface RunUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
}

export interface RunRecord {
  id: string
  routeId: string
  routeName: string
  agentProfile: string
  projectId: string
  triggerType: TriggerType
  triggerRef: string
  triggerRevision: string
  triggerUrl?: string
  title: string
  status: RunStatus
  hermesRunId?: string
  hermesSessionId?: string
  summary?: string
  error?: string
  usage?: RunUsage
  startedAt?: number
  endedAt?: number
  createdAt: number
  updatedAt: number
}

// ─────────────────────────────────────────────────────────────
// Configuration (~/.parallax/config.json)
// ─────────────────────────────────────────────────────────────

export interface HermesProfileConfig {
  name: string
  apiKey: string
  githubLogin?: string
  role?: string
  enabled: boolean
}

export interface HermesConfig {
  baseUrl: string
  profiles: HermesProfileConfig[]
}

export interface CloudConfig {
  baseUrl: string
  apiKey: string
  runnerName: string
}

export interface ProjectConfig {
  id: string
  provider: TicketProvider
  filters: {
    team?: string
    state?: string
    labels?: string[]
    project?: string
    owner?: string
    repo?: string
  }
}

export interface StoredConfig {
  version: number
  cloud: CloudConfig | null
  hermes: HermesConfig | null
  projects: ProjectConfig[]
  secrets: Record<string, string>
  updatedAt: number
}

export interface ServerConfig {
  apiPort: number
  networkAccess: boolean
}

export interface AppConfig {
  projects: ProjectConfig[]
  hermes: HermesConfig | null
  cloud: CloudConfig | null
  concurrency: number
  logs: LogLevel[]
  server: ServerConfig
}

export const CONFIG_VERSION = 2
export const DEFAULT_API_PORT = 9371
export const DEFAULT_CONCURRENCY = 2

/** Hermes' own docs warn that two agents must never drive one profile at once. */
export const MAX_CONCURRENT_RUNS_PER_AGENT = 1

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
