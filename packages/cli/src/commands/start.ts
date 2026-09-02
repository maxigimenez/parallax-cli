import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import chalk from 'chalk'
import { spawnDetached, waitForUrlHealth } from '../process.js'
import { RUNNER_STDERR_FILE, RUNNER_STDOUT_FILE } from '../constants.js'
import { resolveRunnerNode, SQLITE_FLAG } from '../node-runtime.js'
import type { CliContext, StartCommandOptions } from '../types.js'

const require = createRequire(import.meta.url)

/** Locates the built runner entry point across dev and installed layouts. */
export function resolveRunnerEntryPoint(rootDir: string): string {
  const candidates = [
    () => require.resolve('@parallax/orchestrator/dist/orchestrator/src/index.js'),
    () => require.resolve('@parallax/orchestrator/dist/index.js'),
    () => require.resolve('@parallax/orchestrator'),
  ]
  for (const candidate of candidates) {
    try {
      return candidate()
    } catch {
      continue
    }
  }

  const fallback = path.resolve(rootDir, 'packages/orchestrator/dist/orchestrator/src/index.js')
  return fallback
}

export async function runStart(context: CliContext, options: StartCommandOptions): Promise<void> {
  const dataDir = context.defaultDataDir
  await fs.mkdir(dataDir, { recursive: true })

  const config = await context.loadStoredConfig()
  if (!config.hermes) {
    throw new Error('No Hermes gateway configured. Run "parallax init" first.')
  }

  const manifestPath = path.join(dataDir, context.manifestFile)
  try {
    const running = await context.loadRunningState()
    process.kill(running.runnerPid, 0)
    throw new Error(
      `Parallax is already running (pid ${running.runnerPid}, port ${running.apiPort}). Run "parallax stop" first.`
    )
  } catch (error: unknown) {
    // ESRCH means the recorded pid is gone, so the manifest is stale.
    const code = (error as { code?: string }).code
    if (code === 'ESRCH') {
      await fs.rm(manifestPath, { force: true })
    } else if (error instanceof Error && error.message.includes('already running')) {
      throw error
    }
  }

  const env = context.buildEnvConfig(dataDir, options)
  const entry = resolveRunnerEntryPoint(context.rootDir)

  // An absolute interpreter path, so the daemon keeps working after a version
  // switch rather than inheriting whatever `node` happens to mean later.
  const runtime = resolveRunnerNode(dataDir)

  if (options.foreground) {
    // Inherit stdio so logs go straight to the terminal; used by launchd too.
    const { spawn } = await import('node:child_process')
    const child = spawn(runtime.binary, [SQLITE_FLAG, entry], {
      cwd: context.rootDir,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    })
    await new Promise<void>((resolve) => child.on('close', () => resolve()))
    return
  }

  const stdout = path.join(dataDir, RUNNER_STDOUT_FILE)
  const stderr = path.join(dataDir, RUNNER_STDERR_FILE)
  await Promise.all([fs.writeFile(stdout, ''), fs.writeFile(stderr, '')])

  const pid = spawnDetached(runtime.binary, [SQLITE_FLAG, entry], context.rootDir, env, {
    stdoutPath: stdout,
    stderrPath: stderr,
  })

  const apiBase = `http://localhost:${options.apiPort}`
  try {
    await waitForUrlHealth(`${apiBase}/runtime/health`, 'runner API')
  } catch (error: unknown) {
    try {
      process.kill(pid)
    } catch {
      // Already gone.
    }
    // The runner's own stderr says far more than "it did not start".
    const tail = await fs.readFile(stderr, 'utf8').catch(() => '')
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\n${tail
        .split('\n')
        .slice(-30)
        .join('\n')}`
    )
  }

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        startedAt: Date.now(),
        runnerPid: pid,
        apiPort: options.apiPort,
        networkAccess: options.networkAccess,
      },
      null,
      2
    )
  )

  console.log(chalk.green(`Parallax runner started (pid ${pid}) on ${apiBase}`))
  if (options.networkAccess) {
    console.log(
      chalk.yellow('Network access is on: the unauthenticated runner API is exposed to your LAN.')
    )
  }
  console.log(chalk.dim('  parallax status    see what it is doing'))
  console.log(chalk.dim('  parallax logs      follow run output'))
}
