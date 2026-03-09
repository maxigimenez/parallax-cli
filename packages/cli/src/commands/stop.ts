import fs from 'node:fs/promises'
import path from 'node:path'
import { parseStopOptions } from '../args.js'
import { startSpinner, stopProcessBestEffort } from '../process.js'
import type { CliContext } from '../types.js'

export async function runStop(args: string[], context: CliContext) {
  const options = parseStopOptions(args, context.resolvePath, context.defaultDataDir)
  const manifestPath = path.join(options.dataDir, context.manifestFile)
  const spinner = startSpinner('Stopping Parallax...')

  try {
    const state = await context.loadRunningState(options.dataDir)

    await stopProcessBestEffort(state.orchestratorPid, 'orchestrator', options.force)
    await stopProcessBestEffort(state.uiPid, 'UI', options.force)

    await fs.unlink(manifestPath).catch(() => undefined)
  } finally {
    spinner?.stop()
  }

  console.log(`Stopped parallax instance from ${manifestPath}.`)
}
