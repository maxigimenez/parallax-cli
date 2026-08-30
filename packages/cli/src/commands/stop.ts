import fs from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import { isProcessAlive, waitForExit } from '../process.js'
import type { CliContext } from '../types.js'

export async function runStop(context: CliContext): Promise<void> {
  const manifestPath = path.join(context.defaultDataDir, context.manifestFile)

  let running
  try {
    running = await context.loadRunningState()
  } catch {
    console.log('Parallax is not running.')
    return
  }

  if (!isProcessAlive(running.runnerPid)) {
    await fs.rm(manifestPath, { force: true })
    console.log('Parallax was not running; cleared a stale manifest.')
    return
  }

  process.kill(running.runnerPid, 'SIGTERM')
  const exited = await waitForExit(running.runnerPid, 8_000)
  if (!exited) {
    // The runner holds a long poll open; SIGTERM during one can take a moment.
    process.kill(running.runnerPid, 'SIGKILL')
    await waitForExit(running.runnerPid, 2_000)
  }

  await fs.rm(manifestPath, { force: true })
  console.log(chalk.green(`Stopped Parallax runner (pid ${running.runnerPid}).`))
}
