import chalk from 'chalk'
import type { ProjectConfig } from '@sentinel0/common'
import { getJson, runnerUnreachable } from '../api.js'
import type { CliContext } from '../types.js'

export async function runProjects(context: CliContext): Promise<void> {
  const apiBase = await context.resolveDefaultApiBase()

  const { projects } = await getJson<{ projects: ProjectConfig[] }>(`${apiBase}/projects`).catch(
    () => {
      throw runnerUnreachable(apiBase)
    }
  )

  if (projects.length === 0) {
    console.log(chalk.yellow('No projects. Nothing can trigger.'))
    console.log(chalk.dim('  Projects are cloud configuration: POST /v1/projects'))
    console.log(chalk.dim('  Then "sentinel0 reload" to pick them up without a restart.'))
    return
  }

  console.log('')
  for (const project of projects) {
    console.log(`  ${chalk.bold(project.id)} ${chalk.dim(project.provider)}`)
    const filters = Object.entries(project.filters).filter(([, value]) => value !== undefined)
    if (filters.length === 0) {
      console.log(chalk.dim('      filters   (none)'))
    }
    for (const [key, value] of filters) {
      console.log(
        chalk.dim(`      ${key.padEnd(9)} ${Array.isArray(value) ? value.join(', ') : value}`)
      )
    }
  }
  // The most common reason a route never fires: the source filter never
  // fetched the ticket in the first place.
  console.log('')
  console.log(
    chalk.dim('  Filters narrow what is fetched. A route can only match what a filter let through.')
  )
  console.log('')
}
