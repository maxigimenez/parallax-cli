import chalk from 'chalk'
import { postJson, runnerUnreachable } from '../api.js'
import type { CliContext } from '../types.js'

/** Re-reads local config and re-pulls projects, routes, and agents from the cloud. */
export async function runReload(context: CliContext): Promise<void> {
  const apiBase = await context.resolveDefaultApiBase()

  const result = await postJson<{ projects: number; routes: number }>(
    `${apiBase}/runtime/reload`,
    {}
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('Could not reach')) {
      throw runnerUnreachable(apiBase)
    }
    throw error
  })

  console.log(chalk.green(`Reloaded: ${result.projects} project(s), ${result.routes} route(s).`))
}
