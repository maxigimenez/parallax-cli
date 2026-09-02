import chalk from 'chalk'
import { postJson, runnerUnreachable } from '../api.js'
import type { CancelCommandOptions, CliContext } from '../types.js'

export async function runCancel(context: CliContext, options: CancelCommandOptions): Promise<void> {
  const apiBase = await context.resolveDefaultApiBase()

  await postJson(`${apiBase}/runs/${options.runId}/cancel`, {}).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('Could not reach')) {
      throw runnerUnreachable(apiBase)
    }
    throw error
  })

  console.log(chalk.green(`Canceled ${options.runId}.`))
}
