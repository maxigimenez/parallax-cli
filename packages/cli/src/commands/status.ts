import chalk from 'chalk'
import { getJson, runnerUnreachable } from '../api.js'
import { isProcessAlive } from '../process.js'
import type { CliContext } from '../types.js'

interface Health {
  status: string
  version: string
  projects: number
  agents: number
  routes: number
  cloud: string
  hermes: string | null
}

export async function runStatus(context: CliContext): Promise<void> {
  let running
  try {
    running = await context.loadRunningState()
  } catch {
    console.log(chalk.yellow('Sentinel0 is not running.'))
    console.log(chalk.dim('  sentinel0 start'))
    process.exitCode = 1
    return
  }

  if (!isProcessAlive(running.runnerPid)) {
    console.log(chalk.yellow(`Manifest points at pid ${running.runnerPid}, which is gone.`))
    console.log(chalk.dim('  sentinel0 stop     clear it, then start again'))
    process.exitCode = 1
    return
  }

  const apiBase = `http://localhost:${running.apiPort}`
  let health: Health
  try {
    health = await getJson<Health>(`${apiBase}/runtime/health`)
  } catch {
    throw runnerUnreachable(apiBase)
  }

  const uptime = Math.round((Date.now() - running.startedAt) / 1000)
  console.log('')
  console.log(`  ${chalk.green('running')}  pid ${running.runnerPid}  ${apiBase}`)
  console.log(chalk.dim(`  up ${uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`}`))
  console.log('')
  console.log(`  agents    ${health.agents}`)
  console.log(`  routes    ${health.routes}`)
  console.log(`  projects  ${health.projects}`)
  console.log(`  hermes    ${health.hermes ?? chalk.yellow('not configured')}`)
  console.log(`  cloud     ${health.cloud}`)

  const { errors, hasErrors } = await getJson<{ errors: string[]; hasErrors: boolean }>(
    `${apiBase}/runtime/errors`
  ).catch(() => ({ errors: [], hasErrors: false }))

  if (hasErrors) {
    console.log('')
    console.log(chalk.red(`  recent errors (${errors.length}):`))
    for (const line of errors.slice(-5)) {
      console.log(chalk.dim(`    ${line}`))
    }
  }
  console.log('')
}
