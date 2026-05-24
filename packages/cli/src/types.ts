import type { StoredConfig } from '@parallax/common'

export type StopCommandOptions = Record<string, never>

export type RetryCommandOptions = { taskId: string }

export type CancelCommandOptions = {
  taskId: string
}

export type PrReviewCommandOptions = {
  taskId: string
}

export type LogsCommandOptions = {
  taskId?: string
}

export type PreflightCommandOptions = Record<string, never>

export type StatusCommandOptions = Record<string, never>

export type TasksCommandOptions = Record<string, never>

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
  rootDir: string
  cliVersion: string
  resolvePath: (raw: string) => string
  ensureFileExists: (filePath: string) => Promise<boolean>
  loadRunningState: () => Promise<RunningState>
  loadStoredConfig: () => Promise<StoredConfig>
  saveStoredConfig: (config: StoredConfig) => Promise<void>
  resolveDefaultApiBase: () => Promise<string>
  packageVersion: string
  buildEnvConfig: (
    dataDir: string,
    runtime: { apiPort: number; uiPort: number; concurrency: number }
  ) => Record<string, string>
}
