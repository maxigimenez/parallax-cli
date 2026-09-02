import chalk from 'chalk'
import { runStart } from './start.js'
import { runStop } from './stop.js'
import type { CliContext, StartCommandOptions } from '../types.js'

/**
 * Stop then start.
 *
 * Projects and routes refresh on their own each cycle, so this is for changes
 * that genuinely need a new process -- editing ~/.parallax/config.json, or
 * installing a new build. `parallax reload` covers everything else without
 * dropping in-flight runs.
 */
export async function runRestart(context: CliContext, options: StartCommandOptions): Promise<void> {
  await runStop(context).catch(() => undefined)
  console.log(chalk.dim('Restarting…'))
  await runStart(context, options)
}
