import { parsePreflightOptions } from '../args.js'
import { checkGhAuth, commandExists, startSpinner } from '../process.js'
import type { VerifyCheck } from '../types.js'

function isSupportedNodeVersion(version: string): boolean {
  const [majorRaw, minorRaw, patchRaw] = version.replace(/^v/, '').split('.')
  const major = Number.parseInt(majorRaw ?? '0', 10)
  const minor = Number.parseInt(minorRaw ?? '0', 10)
  const patch = Number.parseInt(patchRaw ?? '0', 10)

  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return false
  }

  if (major > 23) {
    return true
  }
  if (major < 23) {
    return false
  }
  if (minor > 7) {
    return true
  }
  if (minor < 7) {
    return false
  }

  return patch >= 0
}

function printVerifyChecks(checks: VerifyCheck[]) {
  const GREEN = '\x1b[32m'
  const RED = '\x1b[31m'
  const DIM = '\x1b[2m'
  const RESET = '\x1b[0m'

  for (const check of checks) {
    const symbol = check.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
    const scope = check.required ? '' : ` ${DIM}(optional)${RESET}`
    const detail = check.detail ? ` ${DIM}- ${check.detail}${RESET}` : ''
    console.log(`${symbol} ${check.name}${scope}${detail}`)
  }
}

export async function runPreflight(args: string[]) {
  parsePreflightOptions(args)
  const checks: VerifyCheck[] = []
  const spinner = startSpinner('Running preflight checks...')

  try {
    checks.push({
      name: 'Node.js >= 23.7.0',
      ok: isSupportedNodeVersion(process.version),
      required: true,
      detail: isSupportedNodeVersion(process.version) ? undefined : `Current: ${process.version}`,
    })

    const gitOk = await commandExists('git')
    checks.push({ name: 'git CLI', ok: gitOk, required: true })

    const pnpmOk = await commandExists('pnpm')
    checks.push({ name: 'pnpm CLI', ok: pnpmOk, required: true })

    const ghOk = await commandExists('gh')
    checks.push({ name: 'gh CLI', ok: ghOk, required: true })

    const ghAuthOk = ghOk ? await checkGhAuth() : false
    checks.push({
      name: 'gh auth status',
      ok: ghAuthOk,
      required: true,
      detail: ghAuthOk ? undefined : 'Run: gh auth login',
    })

    const codexOk = await commandExists('codex')
    checks.push({
      name: 'codex CLI',
      ok: codexOk,
      required: false,
      detail: codexOk ? undefined : 'Install Codex CLI and ensure it is in PATH.',
    })

    const geminiOk = await commandExists('gemini')
    checks.push({
      name: 'gemini CLI',
      ok: geminiOk,
      required: false,
      detail: geminiOk ? undefined : 'Install Gemini CLI (npm i -g @google/gemini-cli).',
    })

    const claudeOk = await commandExists('claude')
    checks.push({
      name: 'claude CLI',
      ok: claudeOk,
      required: false,
      detail: claudeOk
        ? undefined
        : 'Install Claude Code CLI (npm i -g @anthropic-ai/claude-code).',
    })

    checks.push({
      name: 'At least one agent CLI (codex, gemini, or claude)',
      ok: codexOk || geminiOk || claudeOk,
      required: true,
      detail: codexOk || geminiOk || claudeOk ? undefined : 'Install codex, gemini, or claude.',
    })
  } finally {
    spinner?.stop()
  }

  printVerifyChecks(checks)

  if (checks.some((check) => check.required && !check.ok)) {
    console.log('\nVerdict: FAIL - Parallax is not ready to run in this environment.')
    process.exitCode = 1
    return
  }

  console.log('\nVerdict: PASS - Parallax prerequisites are satisfied.')
}
