import fs from 'node:fs/promises'
import path from 'node:path'
import { parseStopOptions } from '../args.js'
import { startSpinner, stopProcessBestEffort } from '../process.js'
import type { CliContext } from '../types.js'

export async function runStop(args: string[], context: CliContext) {
  parseStopOptions(args)
  const manifestPath = path.join(context.defaultDataDir, context.manifestFile)
  const spinner = startSpinner('Stopping Parallax...')

  let state
  try {
    state = await context.loadRunningState()
  } catch {
    spinner?.stop()
    console.log('Parallax is not running.')
    return
  }

  try {
    await stopProcessBestEffort(state.orchestratorPid, 'orchestrator', true)
    await stopProcessBestEffort(state.uiPid, 'UI', true)
    await fs.unlink(manifestPath).catch(() => undefined)
  } finally {
    spinner?.stop()
  }

  console.log('Parallax stopped.')
}
