import chalk from 'chalk'
import { sleep } from '@parallax/common'
import type { CliContext, RunCommandOptions } from '../types.js'

interface RunState {
  status: string
  output?: unknown
  error?: string
  usage?: { total_tokens?: number }
}

function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(textOf).filter(Boolean).join('')
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['text', 'content', 'message', 'output']) {
      if (key in record) {
        const nested = textOf(record[key])
        if (nested) {
          return nested
        }
      }
    }
  }
  return ''
}

/**
 * Sends one prompt straight to a Hermes profile and prints the result.
 *
 * A deliberate shortcut around routes, triggers, and the dispatcher: when
 * something is wrong on the Mac Mini, this answers "can this machine drive that
 * agent at all?" without any Parallax logic in the way. It talks to Hermes
 * directly rather than through the runner, so it works while the runner is down.
 */
export async function runSmokeTest(context: CliContext, options: RunCommandOptions): Promise<void> {
  const config = await context.loadStoredConfig()
  if (!config.hermes) {
    throw new Error('No Hermes gateway configured. Run "parallax init" first.')
  }

  const profile = config.hermes.profiles.find((entry) => entry.name === options.agent)
  if (!profile) {
    const known = config.hermes.profiles.map((entry) => entry.name).join(', ')
    throw new Error(`Unknown profile "${options.agent}". Configured: ${known || 'none'}.`)
  }

  const prefix = profile.name === 'default' ? '' : `/p/${profile.name}`
  const base = `${config.hermes.baseUrl}${prefix}`
  const headers = {
    authorization: `Bearer ${profile.apiKey}`,
    'content-type': 'application/json',
  }

  const created = await fetch(`${base}/v1/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input: options.prompt }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!created.ok) {
    throw new Error(
      `Hermes rejected the run (${created.status}): ${(await created.text()).slice(0, 300)}`
    )
  }

  const { run_id: runId } = (await created.json()) as { run_id?: string }
  if (!runId) {
    throw new Error('Hermes accepted the request but returned no run_id.')
  }

  console.log(chalk.dim(`run ${runId} on profile "${profile.name}"`))

  const deadline = Date.now() + options.timeoutSeconds * 1_000
  let last = ''

  for (;;) {
    if (Date.now() > deadline) {
      await fetch(`${base}/v1/runs/${runId}/stop`, { method: 'POST', headers }).catch(
        () => undefined
      )
      throw new Error(`Timed out after ${options.timeoutSeconds}s; asked Hermes to stop the run.`)
    }

    const response = await fetch(`${base}/v1/runs/${runId}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`Status poll failed (${response.status}).`)
    }

    const state = (await response.json()) as RunState
    if (state.status !== last) {
      console.log(chalk.dim(`  ${state.status}`))
      last = state.status
    }

    if (['completed', 'failed', 'cancelled', 'canceled', 'error'].includes(state.status)) {
      console.log('')
      const output = textOf(state.output)
      console.log(output || chalk.dim('(no output)'))
      if (state.error) {
        console.log(chalk.red(state.error))
      }
      if (state.usage?.total_tokens) {
        console.log(chalk.dim(`\n${state.usage.total_tokens} tokens`))
      }
      if (state.status !== 'completed') {
        process.exitCode = 1
      }
      return
    }

    await sleep(2_000)
  }
}
