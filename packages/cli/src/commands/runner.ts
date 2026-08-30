import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import chalk from 'chalk'
import { LAUNCH_AGENT_LABEL, RUNNER_STDERR_FILE, RUNNER_STDOUT_FILE } from '../constants.js'
import { resolveRunnerEntryPoint } from './start.js'
import type { CliContext, RunnerCommandOptions } from '../types.js'

function plistPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`)
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      default:
        return '&quot;'
    }
  })
}

/**
 * Builds the launchd job.
 *
 * `KeepAlive` restarts the runner if it exits for any reason, and `RunAtLoad`
 * brings it back after a reboot -- the same shape `hermes gateway install`
 * uses, so both halves of the system survive a power cut on the Mac Mini.
 */
function buildPlist(entry: string, dataDir: string, env: Record<string, string>): string {
  const envEntries = Object.entries(env)
    .map(
      ([key, value]) =>
        `      <key>${escapeXml(key)}</key>\n      <string>${escapeXml(value)}</string>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${escapeXml(process.execPath)}</string>
      <string>${escapeXml(entry)}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${envEntries}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${escapeXml(path.join(dataDir, RUNNER_STDOUT_FILE))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(path.join(dataDir, RUNNER_STDERR_FILE))}</string>
    <key>WorkingDirectory</key>
    <string>${escapeXml(dataDir)}</string>
  </dict>
</plist>
`
}

async function launchctl(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('launchctl', args)
    let output = ''
    child.stdout.on('data', (chunk) => (output += String(chunk)))
    child.stderr.on('data', (chunk) => (output += String(chunk)))
    child.on('error', () => resolve({ code: 1, output: 'launchctl not available' }))
    child.on('close', (code) => resolve({ code: code ?? 1, output }))
  })
}

export async function runRunner(context: CliContext, options: RunnerCommandOptions): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('"parallax runner" manages a macOS launchd agent and only works on macOS.')
  }

  const target = plistPath()
  const dataDir = context.defaultDataDir
  const uid = process.getuid?.() ?? 0

  if (options.action === 'status') {
    const exists = await fs
      .access(target)
      .then(() => true)
      .catch(() => false)
    if (!exists) {
      console.log(chalk.yellow('Not installed.'))
      console.log(chalk.dim('  parallax runner install'))
      return
    }
    const { output } = await launchctl(['print', `gui/${uid}/${LAUNCH_AGENT_LABEL}`])
    const state = output.match(/state = (\w+)/)?.[1]
    const pid = output.match(/pid = (\d+)/)?.[1]
    console.log(
      state === 'running'
        ? chalk.green(`Installed and running (pid ${pid ?? '?'}).`)
        : chalk.yellow(`Installed but ${state ?? 'not running'}.`)
    )
    console.log(chalk.dim(`  ${target}`))
    return
  }

  if (options.action === 'uninstall') {
    await launchctl(['bootout', `gui/${uid}/${LAUNCH_AGENT_LABEL}`])
    await fs.rm(target, { force: true })
    console.log(chalk.green('Uninstalled the Parallax launch agent.'))
    return
  }

  const config = await context.loadStoredConfig()
  if (!config.hermes) {
    throw new Error('Run "parallax init" before installing the launch agent.')
  }

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.mkdir(dataDir, { recursive: true })

  const env = context.buildEnvConfig(dataDir, {
    apiPort: Number.parseInt(process.env.PARALLAX_SERVER_API_PORT ?? '9371', 10),
    concurrency: 2,
    networkAccess: false,
  })

  // launchd starts jobs with a minimal PATH, so the node binary must be
  // absolute and PATH must be spelled out for `gh` to be findable.
  env.PATH = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
  env.HOME = os.homedir()

  await fs.writeFile(target, buildPlist(resolveRunnerEntryPoint(context.rootDir), dataDir, env))

  await launchctl(['bootout', `gui/${uid}/${LAUNCH_AGENT_LABEL}`])
  const { code, output } = await launchctl(['bootstrap', `gui/${uid}`, target])
  if (code !== 0) {
    throw new Error(`launchctl bootstrap failed: ${output.trim()}`)
  }

  console.log(chalk.green('Installed. The runner will start now and on every login.'))
  console.log(chalk.dim(`  ${target}`))
  console.log(chalk.dim('  parallax runner status'))
}
