import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'
import { sleep } from '@parallax/common'

export type SpinnerController = {
  stop: () => void
}

export function startSpinner(message: string): SpinnerController | undefined {
  if (!process.stdout.isTTY) {
    console.log(message)
    return undefined
  }

  const frames = ['|', '/', '-', '\\']
  let frameIndex = 0
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[frameIndex % frames.length]} ${message}`)
    frameIndex += 1
  }, 100)

  return {
    stop() {
      clearInterval(timer)
      process.stdout.write('\r')
      process.stdout.write('\n')
    },
  }
}

export function spawnDetached(
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

export function isProcessAlive(pid: number): boolean {
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

export async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true
    }
    await sleep(250)
  }

  return !isProcessAlive(pid)
}

export async function stopProcessOrThrow(
  pid: number,
  label: string,
  force: boolean
): Promise<void> {
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

export async function stopProcessBestEffort(
  pid: number | undefined,
  label: string,
  force: boolean
) {
  if (!pid || !Number.isFinite(pid) || pid <= 0 || !isProcessAlive(pid)) {
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

export async function waitForUrlHealth(url: string, name: string): Promise<void> {
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

  throw new Error(`${name} failed to become ready at ${url}: ${lastError ?? 'timeout'}`)
}

export async function readFileTail(
  filePath: string,
  ensureFileExists: (filePath: string) => Promise<boolean>,
  maxLines: number = 30
) {
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

export async function commandExists(command: string): Promise<boolean> {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command
  return new Promise((resolve) => {
    const child = spawn(executable, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code !== 127))
  })
}

export async function checkGhAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    const executable = process.platform === 'win32' ? 'gh.cmd' : 'gh'
    const child = spawn(executable, ['auth', 'status'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}
