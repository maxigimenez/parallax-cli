#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import yaml from 'js-yaml'
import { TaskPlanState } from '@parallax/common'

type TaskPendingState = {
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

type PendingCommandOptions = {
  apiBase: string
  dataDir: string
  configPath?: string
  approve?: string
  reject?: string
  reason?: string
  approver?: string
  json?: boolean
}

type StopCommandOptions = {
  dataDir: string
  force: boolean
}

type RetryCommandOptions = {
  apiBase: string
  taskId: string
  mode: 'full' | 'execution'
}

type CancelCommandOptions = {
  apiBase: string
  taskId: string
}

type LogsCommandOptions = {
  apiBase: string
  taskId?: string
  since?: number
}

type PreflightCommandOptions = Record<string, never>

type RunningState = {
  startedAt: number
  configPath: string
  dataDir: string
  orchestratorPid: number
  uiPid?: number
}

const DEFAULT_DATA_DIR = path.join(process.cwd(), '.parallax')
const DEFAULT_API_BASE = 'http://localhost:3000'
const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'parallax.yml')
const MANIFEST_FILE = 'running.json'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CLI_VERSION = '0.0.1'
const ROOT_DIR = findWorkspaceRoot(__dirname)

function findWorkspaceRoot(startDir: string): string {
  let current = startDir
  while (current !== path.parse(current).root) {
    const packageJsonPath = path.join(current, 'package.json')
    if (fsSync.existsSync(packageJsonPath)) {
      const content = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf8'))
      if (content.name === 'parallax') {
        return current
      }
    }
    current = path.dirname(current)
  }

  return process.cwd()
}

function parseArg(args: string[], key: string): string | undefined {
  const keyWithPrefix = `--${key}`
  const valueIdx = args.findIndex((entry) => entry === keyWithPrefix)

  if (valueIdx >= 0 && args[valueIdx + 1]) {
    return args[valueIdx + 1]
  }

  return undefined
}

function hasFlag(args: string[], key: string): boolean {
  return args.includes(`--${key}`)
}

function parseArgValue(args: string[], key: string): string {
  const value = parseArg(args, key)
  if (!hasFlag(args, key)) {
    throw new Error(`Unexpected parser state: --${key} is not set.`)
  }

  if (!value || !value.trim()) {
    throw new Error(`Missing value for --${key}.`)
  }

  return value
}

function parseOptionalArg(args: string[], key: string): string | undefined {
  if (!hasFlag(args, key)) {
    return undefined
  }

  return parseArgValue(args, key)
}

function ensureArray(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid array value in ${source}.`)
  }

  return value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`Invalid item in array value from ${source}.`)
    }

    return entry.trim()
  })
}

function parseRunningState(raw: string, source: string): RunningState {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid running manifest at ${source}: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error }
    )
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { startedAt?: unknown }).startedAt !== 'number' ||
    typeof (parsed as { configPath?: unknown }).configPath !== 'string' ||
    typeof (parsed as { dataDir?: unknown }).dataDir !== 'string' ||
    typeof (parsed as { orchestratorPid?: unknown }).orchestratorPid !== 'number' ||
    (parsed as { orchestratorPid: number }).orchestratorPid <= 0 ||
    ('uiPid' in parsed &&
      typeof (parsed as { uiPid?: unknown }).uiPid !== 'number') ||
    (typeof (parsed as { uiPid?: unknown }).uiPid === 'number' &&
      (parsed as { uiPid: number }).uiPid <= 0)
  ) {
    throw new Error(`Invalid running manifest at ${source}.`)
  }

  return parsed as RunningState
}

export function parseConfigProjectIds(raw: string, source: string): Set<string> {
  const parsed = (yaml.load(raw) as { projects?: unknown }) || {}
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { projects?: unknown }).projects)
  ) {
    throw new Error(`Invalid parallax config at ${source}.`)
  }

  const projects = ensureArray(
    (parsed as { projects: unknown[] }).projects.map((project) =>
      typeof project === 'object' && project && 'id' in project
        ? (project as { id?: unknown }).id
        : undefined
    ),
    `projects section in ${source}`
  )

  if (projects.length === 0) {
    throw new Error(`Config ${source} has no projects.`)
  }

  return new Set(projects)
}

export function scopePendingTasks(
  tasks: TaskPendingState[],
  allowedProjectIds: Set<string> | undefined
): TaskPendingState[] {
  if (!allowedProjectIds) {
    return tasks
  }

  return tasks.filter((task) => {
    if (!task.projectId) {
      throw new Error(`Pending task ${task.id} has no projectId. Cannot apply project-level scope.`)
    }

    return allowedProjectIds.has(task.projectId)
  })
}

export function resolveApproveTargets(tasks: TaskPendingState[], approveValue: string): string[] {
  const available = new Set(tasks.map((task) => task.id))
  if (approveValue === 'all') {
    if (tasks.length === 0) {
      throw new Error('No pending plans available to approve.')
    }
    return [...available]
  }

  const explicit = approveValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (explicit.length === 0) {
    throw new Error('approve value must include at least one task id.')
  }

  const unknown = explicit.filter((id) => !available.has(id))
  if (unknown.length > 0) {
    throw new Error(`Unknown task id(s): ${unknown.join(', ')}`)
  }

  return explicit
}

export function resolveRejectTarget(tasks: TaskPendingState[], rejectId: string): string {
  const available = new Set(tasks.map((task) => task.id))
  if (!available.has(rejectId)) {
    throw new Error(`Unknown task id: ${rejectId}`)
  }

  return rejectId
}

export function parseStopOptions(args: string[]): StopCommandOptions {
  return {
    dataDir: resolvePath(parseOptionalArg(args, 'data-dir') || DEFAULT_DATA_DIR),
    force: hasFlag(args, 'force'),
  }
}

function printUsage(): void {
  const text = `Usage:
  parallax --version
  parallax start [--config <path>] [--data-dir <path>]
  parallax pending [--api <base>] [--config <path>] [--data-dir <path>] [--approve <id|all>] [--reject <id> --reason <text>] [--json]
  parallax preflight
  parallax retry <task-id> [--api <base>] [--mode <full|execution>]
  parallax cancel <task-id> [--api <base>]
  parallax stop [--data-dir <path>] [--force]
  parallax logs [--api <base>] [--task <id>] [--since <epoch-ms>]

Commands:
  start      Start orchestrator + UI in background.
  pending    List pending plans and optionally approve/reject them.
  preflight  Validate local prerequisites and auth.
  retry      Queue a task for manual retry.
  cancel     Cancel a pending or running task.
  stop       Stop running parallax processes.
  logs       Tail task logs from orchestrator API.

Examples:
  parallax start --config ./parallax.yml --data-dir ./.parallax
  parallax start --data-dir ./.parallax
  parallax pending --approve all
  parallax preflight
  parallax pending --reject abc-123 --reason "Needs redesign"
  parallax retry ENG-123 --mode execution
  parallax cancel ENG-123
  parallax stop --data-dir ./.parallax
  parallax logs --task ENG-123`

  console.log(text)
}

function resolvePath(raw: string): string {
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

async function ensureFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function loadRunningState(dataDir: string): Promise<RunningState> {
  const manifestPath = path.join(dataDir, MANIFEST_FILE)
  if (!(await ensureFileExists(manifestPath))) {
    throw new Error(`No running instance found at ${manifestPath}. Run parallax start first.`)
  }

  const raw = await fs.readFile(manifestPath, 'utf8')
  return parseRunningState(raw, manifestPath)
}

export async function resolveProjectIdsFromRunningConfig(dataDir: string): Promise<Set<string>> {
  const manifest = await loadRunningState(dataDir)

  if (!(await ensureFileExists(manifest.configPath))) {
    throw new Error(`Running config file not found: ${manifest.configPath}`)
  }

  const raw = await fs.readFile(manifest.configPath, 'utf8')
  return parseConfigProjectIds(raw, manifest.configPath)
}

export async function resolveProjectIdsForPending(
  dataDir: string,
  configPath?: string
): Promise<Set<string>> {
  if (configPath) {
    if (!(await ensureFileExists(configPath))) {
      throw new Error(`Config file not found: ${configPath}`)
    }

    const raw = await fs.readFile(configPath, 'utf8')
    return parseConfigProjectIds(raw, configPath)
  }

  return resolveProjectIdsFromRunningConfig(dataDir)
}

function spawnDetached(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  options: {
    stdoutPath?: string
    stderrPath?: string
  } = {}
): number {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command
  const stdoutFd = options.stdoutPath ? fsSync.openSync(options.stdoutPath, 'a') : undefined
  const stderrFd = options.stderrPath ? fsSync.openSync(options.stderrPath, 'a') : undefined
  const child = spawn(executable, args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    detached: true,
    stdio: ['ignore', stdoutFd ?? 'ignore', stderrFd ?? 'ignore'],
  })

  if (typeof stdoutFd === 'number') {
    fsSync.closeSync(stdoutFd)
  }
  if (typeof stderrFd === 'number') {
    fsSync.closeSync(stderrFd)
  }

  child.unref()
  return child.pid ?? 0
}

function resolveOrchestratorEntryPoint(): string {
  const require = createRequire(import.meta.url)
  const packageCandidates = [
    '@parallax/orchestrator/dist/orchestrator/src/index.js',
    '@parallax/orchestrator/dist/index.js',
  ]
  for (const candidate of packageCandidates) {
    try {
      return require.resolve(candidate)
    } catch {
      // try next candidate
    }
  }

  const localCandidates = [
    path.resolve(ROOT_DIR, 'packages/orchestrator/dist/orchestrator/src/index.js'),
    path.resolve(ROOT_DIR, 'packages/orchestrator/dist/index.js'),
  ]
  for (const candidate of localCandidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'Unable to resolve orchestrator runtime. Build dependencies first or reinstall parallax package.'
  )
}

function buildEnvConfig(configPath: string | undefined, dataDir: string) {
  const env: Record<string, string> = {}

  if (configPath) {
    env.PARALLAX_CONFIG_PATH = configPath
  }

  env.PARALLAX_DATA_DIR = dataDir
  env.PARALLAX_DB_PATH = path.join(dataDir, 'parallax.db')

  return env
}

async function validateConfigFile(configPath: string): Promise<void> {
  const raw = await fs.readFile(configPath, 'utf8')
  const parsed = (yaml.load(raw) || {}) as { projects?: unknown }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
    throw new Error(`Invalid parallax config at ${configPath}`)
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      return false
    }

    throw new Error(`Cannot inspect process ${pid}: ${error.message}`, { cause: error })
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true
    }

    await sleep(250)
  }

  return !isProcessAlive(pid)
}

async function stopProcessOrThrow(pid: number, label: string, force: boolean): Promise<void> {
  if (!isProcessAlive(pid)) {
    throw new Error(`${label} process ${pid} is not running.`)
  }

  process.kill(pid, 'SIGTERM')

  if (await waitForExit(pid, 4000)) {
    return
  }

  if (!force) {
    throw new Error(
      `${label} process ${pid} did not stop after SIGTERM. Use --force to send SIGKILL.`
    )
  }

  process.kill(pid, 'SIGKILL')

  if (!(await waitForExit(pid, 4000))) {
    throw new Error(`${label} process ${pid} did not stop after SIGKILL.`)
  }
}

async function stopProcessBestEffort(pid: number, label: string, force: boolean): Promise<void> {
  if (!pid || !Number.isFinite(pid) || pid <= 0) {
    return
  }

  if (!isProcessAlive(pid)) {
    return
  }

  try {
    await stopProcessOrThrow(pid, label, force)
  } catch (error) {
    if (!force) {
      throw error
    }
  }
}

async function waitForUrlHealth(url: string, name: string): Promise<void> {
  const deadline = Date.now() + 12000
  let lastError: string | undefined

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
      lastError = `${response.status} ${response.statusText}`
    } catch (error: any) {
      const cause = error?.cause?.message ? ` (${error.cause.message})` : ''
      lastError = `${error.message}${cause}`
    }

    await sleep(500)
  }

  throw new Error(`${name} failed to become ready at ${url}: ${lastError || 'timeout'}`)
}

async function readFileTail(filePath: string, maxLines: number = 30): Promise<string> {
  if (!(await ensureFileExists(filePath))) {
    return '(log file not found)'
  }

  const content = await fs.readFile(filePath, 'utf8')
  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return '(no output yet)'
  }

  return lines.slice(-maxLines).join('\n')
}

async function runStart(args: string[]) {
  const configArg = hasFlag(args, 'config') ? parseArgValue(args, 'config') : undefined
  const dataDir = resolvePath(parseOptionalArg(args, 'data-dir') || DEFAULT_DATA_DIR)

  await fs.mkdir(dataDir, { recursive: true })

  const configPath = configArg ? resolvePath(configArg) : DEFAULT_CONFIG_PATH
  console.log(`Config path: ${configPath}`)
  console.log(`Data dir: ${dataDir}`)

  if (!(await ensureFileExists(configPath))) {
    throw new Error(`Config path not found: ${configPath}`)
  }

  await validateConfigFile(configPath)

  const env = buildEnvConfig(configPath, dataDir)
  let orchestratorPid = 0
  const orchestratorStdoutPath = path.join(dataDir, 'orchestrator.stdout.log')
  const orchestratorStderrPath = path.join(dataDir, 'orchestrator.stderr.log')
  const frames = ['|', '/', '-', '\\']
  let frameIndex = 0
  const spinnerEnabled = Boolean(process.stdout.isTTY)
  const timer = spinnerEnabled
    ? setInterval(() => {
        const frame = frames[frameIndex % frames.length]
        frameIndex += 1
        process.stdout.write(`\r${frame} Starting orchestrator and waiting for API...`)
      }, 100)
    : undefined
  if (!spinnerEnabled) {
    console.log('Starting orchestrator and waiting for API...')
  }

  try {
    const orchestratorEntry = resolveOrchestratorEntryPoint()
    orchestratorPid = spawnDetached(
      process.execPath,
      [orchestratorEntry],
      process.cwd(),
      env,
      {
        stdoutPath: orchestratorStdoutPath,
        stderrPath: orchestratorStderrPath,
      }
    )
    if (orchestratorPid <= 0) {
      throw new Error('Failed to spawn orchestrator process.')
    }

    const apiUrl = `${DEFAULT_API_BASE}/tasks`
    await waitForUrlHealth(apiUrl, 'Orchestrator API')
    if (timer) {
      clearInterval(timer)
      process.stdout.write('\r')
    }
    console.log('Orchestrator API is ready.')

    const manifestPath = path.join(dataDir, MANIFEST_FILE)
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          startedAt: Date.now(),
          configPath,
          dataDir,
          orchestratorPid,
        },
        null,
        2
      )
    )

    console.log('Parallax started in background.')
    console.log(`Config: ${configPath}`)
    console.log(`Data dir: ${dataDir}`)
    console.log(`Orchestrator PID: ${orchestratorPid}`)
    console.log('Dashboard: http://localhost:3000')
    console.log('API: http://localhost:3000')
  } catch (error) {
    if (timer) {
      clearInterval(timer)
      process.stdout.write('\r')
    }

    const processAlive = orchestratorPid > 0 ? isProcessAlive(orchestratorPid) : false
    const stdoutTail = await readFileTail(orchestratorStdoutPath)
    const stderrTail = await readFileTail(orchestratorStderrPath)

    await stopProcessBestEffort(orchestratorPid, 'orchestrator', true)

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${message}

Startup diagnostics:
- orchestrator PID: ${orchestratorPid || 'n/a'}
- process alive at failure: ${processAlive ? 'yes' : 'no'}
- stdout log: ${orchestratorStdoutPath}
- stderr log: ${orchestratorStderrPath}

Recent stderr:
${stderrTail}

Recent stdout:
${stdoutTail}`
    )
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status} ${response.statusText}`)
  }

  const body = (await response.json()) as T
  return body
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${url} ${response.status} ${response.statusText}`)
  }
}

function printPendingSummary(tasks: TaskPendingState[]): void {
  for (const task of tasks) {
    const title = task.title || '(no title)'
    console.log(
      `- ${task.id} | project=${task.projectId || 'unknown'} | plan=${task.planState || 'unknown'} | agent=${task.lastAgent || 'n/a'}`
    )
    console.log(`  title: ${title}`)
    const snippet = task.planMarkdown || task.planResult || ''
    if (snippet) {
      const cleaned = snippet.replace(/\s+/g, ' ').trim()
      console.log(`  plan: ${cleaned.slice(0, 280)}${cleaned.length > 280 ? '...' : ''}`)
    }
  }
}

async function runPending(args: string[]) {
  const options = parsePendingOptions(args)

  const dataDir = resolvePath(options.dataDir)
  const apiBase = options.apiBase
  const configPath = options.configPath ? resolvePath(options.configPath) : undefined

  if (options.reject && !options.reason) {
    throw new Error('Reject action requires --reason.')
  }

  const pendingTasks = await fetchJson<TaskPendingState[]>(`${apiBase}/tasks/pending-plans`)
  const allowedProjectIds = await resolveProjectIdsForPending(dataDir, configPath)
  const scopedTasks: TaskPendingState[] = scopePendingTasks(pendingTasks, allowedProjectIds)

  if (options.approve) {
    const approvedIds = resolveApproveTargets(scopedTasks, options.approve)
    for (const taskId of approvedIds) {
      await postJson(`${apiBase}/tasks/${encodeURIComponent(taskId)}/approve`, {
        approver: options.approver,
      })
      console.log(`Approved: ${taskId}`)
    }
    return
  }

  if (options.reject) {
    const rejectedId = resolveRejectTarget(scopedTasks, options.reject)
    await postJson(`${apiBase}/tasks/${encodeURIComponent(rejectedId)}/reject`, {
      reason: options.reason!,
    })
    console.log(`Rejected: ${rejectedId}`)
    return
  }

  if (options.json) {
    console.log(JSON.stringify(scopedTasks, null, 2))
    return
  }

  if (scopedTasks.length === 0) {
    console.log('No pending plans right now.')
    return
  }

  printPendingSummary(scopedTasks)

  if (!options.approve && !options.reject) {
    console.log(
      '\nApprove/reject with:\n  parallax pending --approve <id|all>\n  parallax pending --reject <id> --reason "<reason>"'
    )
    return
  }
}

async function runStop(args: string[]) {
  const options = parseStopOptions(args)
  const manifestPath = path.join(options.dataDir, MANIFEST_FILE)
  const state = await loadRunningState(options.dataDir)

  await stopProcessBestEffort(state.orchestratorPid, 'orchestrator', options.force)
  if (typeof state.uiPid === 'number') {
    await stopProcessBestEffort(state.uiPid, 'UI', options.force)
  }

  await fs.unlink(manifestPath).catch(() => undefined)
  console.log(`Stopped parallax instance from ${manifestPath}.`)
}

function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

type TaskLogRecord = {
  message: string
  icon: string
  level: 'info' | 'warning' | 'error'
  timestamp: number
}

type TaskLogsApiRecord = {
  taskExternalId: string
  message: string
  icon: string
  level: 'info' | 'warning' | 'error'
  timestamp: number
}

export function parseLogsOptions(args: string[]): LogsCommandOptions {
  const taskId = parseOptionalArg(args, 'task')
  const rawSince = parseOptionalArg(args, 'since')
  let since: number | undefined
  if (rawSince !== undefined) {
    since = Number.parseInt(rawSince, 10)
    if (!Number.isFinite(since) || since < 0) {
      throw new Error('--since must be a non-negative integer epoch timestamp.')
    }
  }

  return {
    apiBase: parseOptionalArg(args, 'api') || DEFAULT_API_BASE,
    taskId: taskId || undefined,
    since,
  }
}

async function runLogs(args: string[]) {
  const options = parseLogsOptions(args)
  let cursor = options.since ?? 0
  let seenAtCursor = new Set<string>()

  const pump = async () => {
    const params = new URLSearchParams({
      since: String(cursor),
      limit: '500',
    })
    if (options.taskId) {
      params.set('taskId', options.taskId)
    }

    const response = await fetchJson<{ logs: TaskLogsApiRecord[] }>(
      `${options.apiBase}/logs?${params.toString()}`
    )
    for (const entry of response.logs) {
      const signature = `${entry.timestamp}|${entry.level}|${entry.icon}|${entry.message}`
      if (entry.timestamp < cursor) {
        continue
      }
      if (entry.timestamp === cursor && seenAtCursor.has(signature)) {
        continue
      }

      console.log(
        `${formatTimestamp(entry.timestamp)} [${entry.taskExternalId}] ${entry.level.toUpperCase()} ${entry.icon} ${entry.message}`
      )
      if (entry.timestamp > cursor) {
        cursor = entry.timestamp
        seenAtCursor = new Set<string>()
      }
      seenAtCursor.add(signature)
    }
  }

  while (true) {
    await pump()
    await sleep(2000)
  }
}

export function parseRetryOptions(args: string[]): RetryCommandOptions {
  const taskId = args[0]
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax retry requires <task-id>.')
  }

  const rawMode = parseOptionalArg(args.slice(1), 'mode') || 'full'
  if (rawMode !== 'full' && rawMode !== 'execution') {
    throw new Error('--mode must be one of: full, execution.')
  }

  return {
    apiBase: parseOptionalArg(args.slice(1), 'api') || DEFAULT_API_BASE,
    taskId,
    mode: rawMode,
  }
}

async function runRetry(args: string[]) {
  const options = parseRetryOptions(args)
  await postJson(`${options.apiBase}/tasks/${encodeURIComponent(options.taskId)}/retry`, {
    mode: options.mode,
  })
  console.log(`Retried: ${options.taskId} (mode=${options.mode})`)
}

export function parseCancelOptions(args: string[]): CancelCommandOptions {
  const taskId = args[0]
  if (!taskId || taskId.startsWith('--')) {
    throw new Error('parallax cancel requires <task-id>.')
  }

  return {
    apiBase: parseOptionalArg(args.slice(1), 'api') || DEFAULT_API_BASE,
    taskId,
  }
}

async function runCancel(args: string[]) {
  const options = parseCancelOptions(args)
  await postJson(`${options.apiBase}/tasks/${encodeURIComponent(options.taskId)}/cancel`, {})
  console.log(`Canceled: ${options.taskId}`)
}

type VerifyCheck = {
  name: string
  ok: boolean
  required: boolean
  detail?: string
}

export function parsePreflightOptions(args: string[]): PreflightCommandOptions {
  if (args.length > 0) {
    throw new Error('parallax preflight does not accept flags.')
  }

  return {}
}

async function commandExists(command: string): Promise<boolean> {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command
  return new Promise((resolve) => {
    const child = spawn(executable, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code !== 127))
  })
}

async function checkGhAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    const executable = process.platform === 'win32' ? 'gh.cmd' : 'gh'
    const child = spawn(executable, ['auth', 'status'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

function printVerifyChecks(checks: VerifyCheck[]) {
  const GREEN = '\x1b[32m'
  const RED = '\x1b[31m'
  const DIM = '\x1b[2m'
  const RESET = '\x1b[0m'

  for (const check of checks) {
    const symbol = check.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
    const scope = check.required ? '' : ` ${DIM}(optional)${RESET}`
    const detail = check.detail ? ` ${DIM}- ${check.detail}${RESET}` : ''
    console.log(`${symbol} ${check.name}${scope}${detail}`)
  }
}

async function runPreflight(args: string[]) {
  parsePreflightOptions(args)
  const checks: VerifyCheck[] = []
  const frames = ['|', '/', '-', '\\']
  const spinnerEnabled = Boolean(process.stdout.isTTY)
  let frameIndex = 0
  const timer = spinnerEnabled
    ? setInterval(() => {
        const frame = frames[frameIndex % frames.length]
        frameIndex += 1
        process.stdout.write(`\r${frame} Running preflight checks...`)
      }, 100)
    : undefined

  if (!spinnerEnabled) {
    console.log('Running preflight checks...')
  }

  try {
    const gitOk = await commandExists('git')
    checks.push({ name: 'git CLI', ok: gitOk, required: true })

    const pnpmOk = await commandExists('pnpm')
    checks.push({ name: 'pnpm CLI', ok: pnpmOk, required: true })

    const ghOk = await commandExists('gh')
    checks.push({ name: 'gh CLI', ok: ghOk, required: true })

    const ghAuthOk = ghOk ? await checkGhAuth() : false
    checks.push({
      name: 'gh auth status',
      ok: ghAuthOk,
      required: true,
      detail: ghAuthOk ? undefined : 'Run: gh auth login',
    })

    const codexOk = await commandExists('codex')
    checks.push({
      name: 'codex CLI',
      ok: codexOk,
      required: false,
      detail: codexOk ? undefined : 'Install Codex CLI and ensure it is in PATH.',
    })

    const geminiOk = await commandExists('gemini')
    checks.push({
      name: 'gemini CLI',
      ok: geminiOk,
      required: false,
      detail: geminiOk ? undefined : 'Install Gemini CLI (npm i -g @google/gemini-cli).',
    })

    checks.push({
      name: 'At least one agent CLI (codex or gemini)',
      ok: codexOk || geminiOk,
      required: true,
      detail: codexOk || geminiOk ? undefined : 'Install codex or gemini.',
    })
  } finally {
    if (timer) {
      clearInterval(timer)
      process.stdout.write('\r')
    }
  }

  printVerifyChecks(checks)

  const failedRequired = checks.filter((check) => check.required && !check.ok)
  if (failedRequired.length > 0) {
    console.log('\nVerdict: FAIL - Parallax is not ready to run in this environment.')
    process.exitCode = 1
    return
  }

  console.log('\nVerdict: PASS - Parallax prerequisites are satisfied.')
}

export function parsePendingOptions(args: string[]): PendingCommandOptions {
  const approve = parseOptionalArg(args, 'approve')
  const reject = parseOptionalArg(args, 'reject')
  const reason = parseOptionalArg(args, 'reason')
  const approver = parseOptionalArg(args, 'approver')

  if (approve && reject) {
    throw new Error('Use either --approve or --reject, not both.')
  }

  if (!approve && reject && !reason) {
    throw new Error('Reject action requires --reason.')
  }

  if (!reject && reason) {
    throw new Error('--reason can only be used with --reject.')
  }

  return {
    apiBase: parseOptionalArg(args, 'api') || DEFAULT_API_BASE,
    dataDir: parseOptionalArg(args, 'data-dir') || DEFAULT_DATA_DIR,
    configPath: parseOptionalArg(args, 'config'),
    approve,
    reject,
    reason,
    approver,
    json: hasFlag(args, 'json'),
  }
}

async function cli() {
  const args = process.argv.slice(2)

  if (args.length === 0 || hasFlag(args, 'help') || hasFlag(args, 'h')) {
    printUsage()
    return
  }

  if (hasFlag(args, 'version') || hasFlag(args, 'v')) {
    console.log(CLI_VERSION)
    return
  }

  const command = args[0]
  const commandArgs = args.slice(1)

  try {
    if (command === 'start') {
      await runStart(commandArgs)
      return
    }

    if (command === 'pending') {
      await runPending(commandArgs)
      return
    }

    if (command === 'preflight') {
      await runPreflight(commandArgs)
      return
    }

    if (command === 'stop') {
      await runStop(commandArgs)
      return
    }

    if (command === 'retry') {
      await runRetry(commandArgs)
      return
    }

    if (command === 'cancel') {
      await runCancel(commandArgs)
      return
    }

    if (command === 'logs') {
      await runLogs(commandArgs)
      return
    }

    printUsage()
  } catch (error: any) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

void cli()
