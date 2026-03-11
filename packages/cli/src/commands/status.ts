import path from 'node:path'
import { sleep } from '@parallax/common'
import { parseStatusOptions } from '../args.js'
import { startSpinner, isProcessAlive } from '../process.js'
import type { CliContext } from '../types.js'

type RuntimeErrorsResponse = {
  hasErrors?: boolean
  errors?: string[]
}

async function fetchRuntimeErrors(apiBase: string): Promise<RuntimeErrorsResponse> {
  const response = await fetch(`${apiBase}/runtime/errors`)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as RuntimeErrorsResponse
}

function printErrors(errors: string[]) {
  for (const error of errors) {
    console.log(error)
  }
}

export async function runStatus(args: string[], context: CliContext) {
  parseStatusOptions(args)
  const GREEN = '\x1b[32m'
  const RED = '\x1b[31m'
  const YELLOW = '\x1b[33m'
  const DIM = '\x1b[2m'
  const RESET = '\x1b[0m'
  const startTime = Date.now()
  const output: string[] = []

  const spinner = startSpinner('Checking Parallax status...')

  try {
    const manifestPath = path.join(context.defaultDataDir, context.manifestFile)
    let state
    try {
      state = await context.loadRunningState()
    } catch {
      output.push('')
      output.push(`${RED}✗ Parallax status: offline.${RESET}`)
      output.push(`Run ${YELLOW}parallax start${RESET} to launch the orchestrator and dashboard.`)
      return
    }

    const orchestratorAlive = isProcessAlive(state.orchestratorPid)
    const uiAlive = state.uiPid ? isProcessAlive(state.uiPid) : true

    if (!orchestratorAlive || !uiAlive) {
      output.push('')
      output.push(`${RED}✗ Parallax status: unhealthy.${RESET}`)
      output.push(`${DIM}Manifest:${RESET} ${manifestPath}`)
      output.push(
        `${DIM}Orchestrator PID:${RESET} ${state.orchestratorPid} ${orchestratorAlive ? '(alive)' : '(not running)'}`
      )
      if (state.uiPid) {
        output.push(`${DIM}UI PID:${RESET} ${state.uiPid} ${uiAlive ? '(alive)' : '(not running)'}`)
      }
      output.push(`Run ${YELLOW}parallax stop${RESET} and then ${YELLOW}parallax start${RESET}.`)
      return
    }

    const apiBase = await context.resolveDefaultApiBase()
    const diagnostics = await fetchRuntimeErrors(apiBase)
    const errors = Array.isArray(diagnostics.errors) ? diagnostics.errors : []

    if (diagnostics.hasErrors && errors.length > 0) {
      output.push('')
      output.push(`${RED}✗ Parallax status: issues detected.${RESET}`)
      output.push(`${DIM}Orchestrator PID:${RESET} ${state.orchestratorPid}`)
      output.push(`${DIM}Dashboard:${RESET} http://localhost:${state.uiPort}`)
      output.push('')
      output.push(...errors)
      return
    }

    output.push('')
    output.push(`${GREEN}✓ Parallax status: healthy.${RESET}`)
    output.push(`${DIM}Orchestrator PID:${RESET} ${state.orchestratorPid}`)
    output.push(`${DIM}Dashboard:${RESET} http://localhost:${state.uiPort}`)
  } finally {
    const remaining = 400 - (Date.now() - startTime)
    if (remaining > 0) {
      await sleep(remaining)
    }
    spinner?.stop()
    for (const line of output) {
      console.log(line)
    }
  }
}
