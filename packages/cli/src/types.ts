import { TaskPlanState } from '@parallax/common'

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
  approve?: string
  reject?: string
}

export type StopCommandOptions = Record<string, never>

export type RetryCommandOptions = { taskId: string }

export type CancelCommandOptions = {
  taskId: string
}

export type LogsCommandOptions = {
  taskId?: string
}

export type PreflightCommandOptions = Record<string, never>

export type RegisterCommandOptions = {
  configPath: string
  envFilePath?: string
}

export type StartCommandOptions = {
  apiPort: number
  uiPort: number
  concurrency: number
}

export type RunningState = {
  startedAt: number
  orchestratorPid: number
  uiPid?: number
  apiPort: number
  uiPort: number
}

export type RegisteredConfig = {
  configPath: string
  addedAt: number
  envFilePath?: string
}

export type RegistryState = {
  configs: RegisteredConfig[]
}

export type VerifyCheck = {
  name: string
  ok: boolean
  required: boolean
  detail?: string
}

export type CliContext = {
  defaultApiBase: string
  defaultDataDir: string
  manifestFile: string
  registryFile: string
  rootDir: string
  cliVersion: string
  resolvePath: (raw: string) => string
  ensureFileExists: (filePath: string) => Promise<boolean>
  loadRunningState: () => Promise<RunningState>
  loadRegistry: () => Promise<RegistryState>
  saveRegistry: (registry: RegistryState) => Promise<void>
  resolveDefaultApiBase: () => Promise<string>
  packageVersion: string
  validateConfigFile: (configPath: string) => Promise<void>
  buildEnvConfig: (
    dataDir: string,
    runtime: { apiPort: number; uiPort: number; concurrency: number }
  ) => Record<string, string>
}
