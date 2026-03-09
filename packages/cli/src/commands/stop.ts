import fs from 'node:fs/promises'
import path from 'node:path'
import { parseStopOptions } from '../args.js'
import { startSpinner, stopProcessBestEffort } from '../process.js'
import type { CliContext } from '../types.js'

export async function runStop(args: string[], context: CliContext) {
  parseStopOptions(args)
  const manifestPath = path.join(context.defaultDataDir, context.manifestFile)
  const spinner = startSpinner('Stopping Parallax...')

  try {
    const state = await context.loadRunningState()

    await stopProcessBestEffort(state.orchestratorPid, 'orchestrator', true)
    await stopProcessBestEffort(state.uiPid, 'UI', true)

    await fs.unlink(manifestPath).catch(() => undefined)
  } finally {
    spinner?.stop()
  }

  console.log(`Stopped parallax instance from ${manifestPath}.`)
}
