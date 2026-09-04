import { spawn } from 'node:child_process'
import chalk from 'chalk'
import type { CliContext, VerifyCheck } from '../types.js'
import { getJson } from '../api.js'
import { findCapableNode } from '../node-runtime.js'

async function commandSucceeds(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Checks exactly what this runner needs.
 *
 * Notably absent: git, pnpm, and any agent CLI. The runner does not execute
 * agents or touch a repository any more -- Hermes does both -- so requiring
 * them here would fail machines that are in fact correctly configured.
 */
export async function runPreflight(context: CliContext): Promise<void> {
  const checks: VerifyCheck[] = []

  // Capability, not version: what matters is whether node:sqlite loads, and
  // which interpreter the runner will actually be started with.
  const runtime = findCapableNode(context.defaultDataDir)
  checks.push({
    name: 'A Node that can load node:sqlite',
    ok: Boolean(runtime),
    required: true,
    detail: runtime
      ? `${runtime.version ?? '?'} at ${runtime.binary}`
      : `none found (running ${process.version})`,
  })

  const config = await context.loadStoredConfig()

  checks.push({
    name: 'Configuration present',
    ok: Boolean(config.hermes && config.cloud),
    required: true,
    detail: config.hermes && config.cloud ? '~/.sentinel0/config.json' : 'run "sentinel0 init"',
  })

  if (config.hermes) {
    for (const profile of config.hermes.profiles.filter((entry) => entry.enabled)) {
      const prefix = profile.name === 'default' ? '' : `/p/${profile.name}`
      let detail = ''
      let ok = false
      try {
        const capabilities = await getJson<{ model?: string; platform?: string }>(
          `${config.hermes.baseUrl}${prefix}/v1/capabilities`,
          { authorization: `Bearer ${profile.apiKey}` }
        )
        ok = true
        detail = capabilities.model ?? capabilities.platform ?? 'reachable'
      } catch (error: unknown) {
        detail = error instanceof Error ? error.message : String(error)
      }
      checks.push({ name: `Hermes profile "${profile.name}"`, ok, required: true, detail })
    }
  }

  if (config.cloud) {
    let ok = false
    let detail = ''
    try {
      const health = await getJson<{ status: string }>(`${config.cloud.baseUrl}/health`)
      ok = health.status === 'ok'
      detail = config.cloud.baseUrl
    } catch (error: unknown) {
      detail = error instanceof Error ? error.message : String(error)
    }
    checks.push({ name: 'Sentinel0 cloud reachable', ok, required: true, detail })
  }

  const ghInstalled = await commandSucceeds('gh', ['--version'])
  checks.push({
    name: 'GitHub CLI installed',
    ok: ghInstalled,
    required: false,
    detail: ghInstalled ? '' : 'Needed only for GitHub projects.',
  })
  if (ghInstalled) {
    const authed = await commandSucceeds('gh', ['auth', 'status'])
    checks.push({
      name: 'GitHub CLI authenticated',
      ok: authed,
      required: false,
      // Only show the remedy when there is something to remedy.
      detail: authed ? '' : 'gh auth login',
    })
  }

  checks.push({
    name: 'LINEAR_API_KEY',
    ok: Boolean(process.env.LINEAR_API_KEY || config.secrets.LINEAR_API_KEY),
    required: false,
    detail: 'Needed only for Linear projects.',
  })

  console.log('')
  for (const check of checks) {
    const mark = check.ok
      ? chalk.green('ok  ')
      : check.required
        ? chalk.red('FAIL')
        : chalk.yellow('warn')
    const suffix = check.detail ? chalk.dim(`  ${check.detail}`) : ''
    console.log(`  ${mark}  ${check.name}${suffix}`)
  }

  const failed = checks.filter((check) => check.required && !check.ok)
  console.log('')
  if (failed.length > 0) {
    console.log(chalk.red(`Verdict: FAIL (${failed.length} required check(s))`))
    process.exitCode = 1
    return
  }
  console.log(chalk.green('Verdict: ready'))
}
