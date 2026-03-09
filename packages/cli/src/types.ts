import { TaskPlanState, type ServerConfig } from '@parallax/common'

export type TaskPendingState = {
  id: string
  externalId?: string
  title?: string
  planState?: TaskPlanState
  projectId?: string
  planMarkdown?: string
  planResult?: string
  lastAgent?: string
  status?: string
}

export type PendingCommandOptions = {
  configPath?: string
  approve?: string
  reject?: string
  approver?: string
  json?: boolean
}

export type StopCommandOptions = {
  force: boolean
}

export type RetryCommandOptions = {
  taskId: string
  mode: 'full' | 'execution'
}

export type CancelCommandOptions = {
  taskId: string
}

export type LogsCommandOptions = {
  apiBase: string
  taskId?: string
  since?: number
}

export type PreflightCommandOptions = Record<string, never>

export type RunningState = {
  startedAt: number
  configPath: string
  orchestratorPid: number
  uiPid?: number
}

export type VerifyCheck = {
  name: string
  ok: boolean
  required: boolean
  detail?: string
}

export type CliContext = {
  defaultApiBase: string
  defaultConfigPath: string
  defaultDataDir: string
  manifestFile: string
  rootDir: string
  cliVersion: string
  resolvePath: (raw: string) => string
  ensureFileExists: (filePath: string) => Promise<boolean>
  loadRunningState: () => Promise<RunningState>
  resolveProjectIdsForPending: (configPath?: string) => Promise<Set<string>>
  resolveDefaultApiBase: (configPath?: string) => Promise<string>
  resolveServerPorts: (configPath: string) => Promise<ServerConfig>
  buildEnvConfig: (configPath: string | undefined, dataDir: string) => Record<string, string>
}
