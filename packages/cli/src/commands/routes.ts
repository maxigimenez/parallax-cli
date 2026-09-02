import chalk from 'chalk'
import type { RoutingRule } from '@parallax/common'
import { getJson, runnerUnreachable } from '../api.js'
import type { CliContext } from '../types.js'

export async function runRoutes(context: CliContext): Promise<void> {
  const apiBase = await context.resolveDefaultApiBase()

  const { routes } = await getJson<{ routes: RoutingRule[] }>(`${apiBase}/routes`).catch(() => {
    throw runnerUnreachable(apiBase)
  })

  if (routes.length === 0) {
    console.log(chalk.yellow('No routes loaded.'))
    console.log(chalk.dim('  Create them against the cloud API: POST /v1/routes'))
    return
  }

  console.log('')
  for (const route of routes) {
    const mark = route.enabled ? chalk.green('*') : chalk.dim('-')
    const target = route.target.agentRef.profile ?? `@${route.target.agentRef.githubLogin}`
    console.log(
      `  ${mark} ${chalk.bold(route.name)} ${chalk.dim(`(${route.id}, p${route.priority})`)}`
    )
    console.log(chalk.dim(`      when   ${route.trigger.type} on ${route.trigger.projectId}`))
    if (route.match.labels?.any?.length) {
      console.log(chalk.dim(`      labels ${route.match.labels.any.join(' | ')}`))
    }
    if (route.match.state?.any?.length) {
      console.log(chalk.dim(`      state  ${route.match.state.any.join(' | ')}`))
    }
    const firstLine = route.execution.prompt.split('\n').find((line) => line.trim()) ?? ''
    console.log(chalk.dim(`      then   ${target}`))
    console.log(
      chalk.dim(`      prompt ${firstLine.slice(0, 68)}${firstLine.length > 68 ? '…' : ''}`)
    )
  }
  console.log('')
}
