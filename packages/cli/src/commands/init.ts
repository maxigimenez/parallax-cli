import * as p from '@clack/prompts'
import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import type { ProjectConfig, SlackConfig } from '@parallax/common'
import type { CliContext } from '../types.js'
import { getModelOptions } from '../agent-models.js'
import { detectGitHubRemote } from '../git-detect.js'

const orange = chalk.hex('#f97316')

function isCancel(value: unknown): value is symbol {
  return typeof value === 'symbol'
}

function assertNotCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }
  return value as T
}

function printWelcomeBanner(version: string) {
  console.log('')
  console.log(`  ${orange.bold('parallax')}${orange('_')}  ${chalk.dim(`v${version}`)}`)
  console.log(`  ${chalk.dim('Local-first AI orchestration runtime')}`)
  console.log('')
}

function validateWorkspaceDir(v: string | undefined): string | undefined {
  const resolved = v?.trim() || process.cwd()
  if (!path.isAbsolute(resolved)) {
    return 'Path must be absolute.'
  }
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) {
      return 'Path must be a directory.'
    }
  } catch {
    return 'Directory not found.'
  }
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    return 'Not a git repository (no .git directory found).'
  }
}

async function promptModel(
  provider: ProjectConfig['agent']['provider']
): Promise<string | undefined> {
  const options = getModelOptions(provider)
  const choice = assertNotCancel(
    await p.select({
      message: 'Model',
      options: [
        { value: '', label: 'Provider default' },
        ...options.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
        { value: '__custom__', label: 'Custom…' },
      ],
    })
  ) as string

  if (choice === '') {
    return undefined
  }
  if (choice !== '__custom__') {
    return choice
  }

  const custom = assertNotCancel(
    await p.text({
      message: 'Custom model identifier',
      validate: (v) => (!v?.trim() ? 'Required.' : undefined),
    })
  ) as string
  return custom.trim()
}

export async function runInit(_args: string[], context: CliContext) {
  printWelcomeBanner(context.cliVersion)

  const storedConfig = await context.loadStoredConfig()
  const isFirstRun = storedConfig.projects.length === 0

  if (!isFirstRun) {
    p.intro(`${orange('◆')} ${chalk.bold('Add another project')}`)

    const action = assertNotCancel(
      await p.select({
        message: `Found ${storedConfig.projects.length} existing project(s). What would you like to do?`,
        options: [
          { value: 'add', label: 'Add another project' },
          { value: 'open', label: 'Open dashboard' },
          { value: 'exit', label: 'Exit' },
        ],
      })
    )

    if (action === 'open') {
      let url = `http://localhost:8080`
      try {
        const state = await context.loadRunningState()
        url = `http://localhost:${state.uiPort}`
      } catch {
        // orchestrator not running, use default port
      }
      p.note(url, 'Dashboard URL')
      p.outro("Open the URL above in your browser, or run 'parallax open'.")
      return
    }

    if (action === 'exit') {
      p.outro('Bye.')
      return
    }
  } else {
    p.intro(`${orange('◆')} ${chalk.bold("Welcome — let's get you set up")}`)
    p.note(
      [
        'This wizard sets up your first project. You can add more',
        'projects, integrations (Slack, Linear, etc.), and secrets',
        `from the dashboard at any time — or by running ${chalk.cyan('parallax init')} again.`,
      ].join('\n'),
      'First project setup'
    )
  }

  // --- Project setup ---

  const projectId = assertNotCancel(
    await p.text({
      message: 'Project ID',
      placeholder: 'my-app',
      validate: (v) => {
        if (!v?.trim()) {
          return 'Project ID is required.'
        }
        if (/\s/.test(v)) {
          return 'Project ID must not contain spaces.'
        }
        if (storedConfig.projects.some((proj) => proj.id === v.trim())) {
          return `Project ID "${v.trim()}" already exists.`
        }
      },
    })
  )

  const workspaceDir = assertNotCancel(
    await p.path({
      message: 'Local git repository (use Tab to navigate, Enter to accept)',
      directory: true,
      initialValue: process.cwd(),
      validate: validateWorkspaceDir,
    })
  ) as string

  const detected = detectGitHubRemote(workspaceDir.trim())

  const provider = assertNotCancel(
    await p.select({
      message: 'Where should Parallax pull tasks from?',
      options: [
        {
          value: 'github',
          label: 'GitHub Issues',
          hint: detected ? `detected: ${detected.owner}/${detected.repo}` : undefined,
        },
        { value: 'linear', label: 'Linear' },
      ],
    })
  ) as 'github' | 'linear'

  let filters: ProjectConfig['pullFrom']['filters'] = {}
  let needsLinearKey = false

  if (provider === 'github') {
    const owner = assertNotCancel(
      await p.text({
        message: 'GitHub owner or org',
        initialValue: detected?.owner,
        validate: (v) => (!v?.trim() ? 'Required.' : undefined),
      })
    )
    const repo = assertNotCancel(
      await p.text({
        message: 'GitHub repository name',
        initialValue: detected?.repo,
        validate: (v) => (!v?.trim() ? 'Required.' : undefined),
      })
    )
    const labelFilter = assertNotCancel(
      await p.text({ message: 'Filter by label (optional, e.g. ai-ready)', placeholder: '' })
    )
    filters = {
      owner: owner.trim(),
      repo: repo.trim(),
      state: 'open',
      labels: labelFilter.trim() ? [labelFilter.trim()] : undefined,
    }
  } else {
    const team = assertNotCancel(
      await p.text({
        message: 'Linear team ID or key',
        validate: (v) => (!v?.trim() ? 'Required.' : undefined),
      })
    )
    const labelFilter = assertNotCancel(
      await p.text({ message: 'Filter by label (optional)', placeholder: '' })
    )
    filters = {
      team: team.trim(),
      labels: labelFilter.trim() ? [labelFilter.trim()] : undefined,
    }
    needsLinearKey = !storedConfig.secrets['LINEAR_API_KEY']
  }

  const agentProvider = assertNotCancel(
    await p.select({
      message: 'Which AI agent should work on this project?',
      options: [
        { value: 'claude-code', label: 'Claude Code' },
        { value: 'codex', label: 'OpenAI Codex' },
        { value: 'gemini', label: 'Google Gemini' },
      ],
    })
  ) as ProjectConfig['agent']['provider']

  const modelOverride = await promptModel(agentProvider)

  const systemPrompt = assertNotCancel(
    await p.text({ message: 'Custom system prompt (optional)', placeholder: '' })
  )

  // --- Secrets ---

  let linearApiKey: string | undefined

  if (needsLinearKey) {
    linearApiKey = assertNotCancel(
      await p.password({
        message: 'Linear API key',
        validate: (v) => (!v?.trim() ? 'Required for Linear integration.' : undefined),
      })
    ) as string
  }

  // --- Slack (offered once if not already configured) ---

  let slackConfig: SlackConfig | undefined

  if (!storedConfig.slack) {
    const wantSlack = assertNotCancel(
      await p.confirm({ message: 'Set up Slack notifications?', initialValue: false })
    )

    if (wantSlack) {
      const botToken = assertNotCancel(
        await p.password({
          message: 'Bot token',
          validate: (v) => {
            if (!v?.trim()) {
              return 'Required.'
            }
            if (!v.trim().startsWith('xoxb-')) {
              return 'Must start with xoxb-'
            }
          },
        })
      )
      const appToken = assertNotCancel(
        await p.password({
          message: 'App token',
          validate: (v) => {
            if (!v?.trim()) {
              return 'Required.'
            }
            if (!v.trim().startsWith('xapp-')) {
              return 'Must start with xapp-'
            }
          },
        })
      )
      const channel = assertNotCancel(
        await p.text({
          message: 'Slack channel',
          placeholder: '#eng-ai',
          validate: (v) => (!v?.trim() ? 'Required.' : undefined),
        })
      )
      slackConfig = {
        botToken: botToken.trim(),
        appToken: appToken.trim(),
        channel: channel.trim(),
      }
    }
  }

  // --- Build new project ---

  const newProject: ProjectConfig = {
    id: projectId.trim(),
    workspaceDir: workspaceDir.trim() || process.cwd(),
    pullFrom: { provider, filters },
    agent: {
      provider: agentProvider,
      model: modelOverride,
      systemPrompt: systemPrompt.trim() || undefined,
    },
  }

  // --- Confirmation ---

  p.note(
    [
      `ID:         ${newProject.id}`,
      `Workspace:  ${newProject.workspaceDir}`,
      `Provider:   ${provider}`,
      `Agent:      ${agentProvider}${newProject.agent.model ? ` (${newProject.agent.model})` : ''}`,
      slackConfig ? `Slack:      ${slackConfig.channel}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    'Summary'
  )

  const confirmed = assertNotCancel(await p.confirm({ message: 'Save this configuration?' }))

  if (!confirmed) {
    p.cancel('Setup cancelled.')
    return
  }

  // --- Write ---

  const updatedConfig = {
    ...storedConfig,
    projects: [...storedConfig.projects, newProject],
    slack: slackConfig ?? storedConfig.slack,
    secrets: linearApiKey
      ? { ...storedConfig.secrets, LINEAR_API_KEY: linearApiKey }
      : storedConfig.secrets,
  }

  await context.saveStoredConfig(updatedConfig)

  // Reload orchestrator if running
  let alreadyRunning = false
  try {
    const state = await context.loadRunningState()
    const reloadRes = await fetch(`http://localhost:${state.apiPort}/runtime/reload`, {
      method: 'POST',
    })
    if (reloadRes.ok) {
      alreadyRunning = true
    } else {
      console.warn(
        `Warning: orchestrator reload returned ${reloadRes.status}. You may need to restart Parallax.`
      )
    }
  } catch {
    // not running, ignore
  }

  const nextSteps = alreadyRunning
    ? [
        `${chalk.dim('•')} Project added. Parallax is already running.`,
        `${chalk.dim('•')} Run ${chalk.cyan('parallax open')} to view the dashboard.`,
      ]
    : [
        `${chalk.dim('•')} Run ${chalk.cyan('parallax start')} to launch the orchestrator.`,
        `${chalk.dim('•')} Run ${chalk.cyan('parallax open')} to view the dashboard.`,
        `${chalk.dim('•')} Manage projects, integrations and secrets from the dashboard.`,
      ]

  p.note(nextSteps.join('\n'), 'Next steps')
  p.outro(orange('Setup complete.'))
}
