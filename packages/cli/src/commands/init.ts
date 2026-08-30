import * as p from '@clack/prompts'
import chalk from 'chalk'
import { CONFIG_VERSION, type HermesProfileConfig, type StoredConfig } from '@parallax/common'
import type { CliContext } from '../types.js'
import { getJson } from '../api.js'

const BRAND = chalk.hex('#f97316')

function assertNotCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }
  return value as T
}

function requiredText(message: string, initialValue?: string, placeholder?: string) {
  return p.text({
    message,
    initialValue,
    placeholder,
    validate: (value) => (value?.trim() ? undefined : 'Required.'),
  })
}

/**
 * Verifies a Hermes profile before we write its key to disk.
 *
 * Catching a wrong key here is far cheaper than catching it as a 401 buried in
 * the runner log an hour later, and `/v1/capabilities` is the cheapest call that
 * proves both reachability and that this key works on this profile's prefix.
 */
async function probeProfile(
  baseUrl: string,
  profile: string,
  apiKey: string
): Promise<{ ok: boolean; detail: string }> {
  const prefix = profile === 'default' ? '' : `/p/${profile}`
  try {
    const capabilities = await getJson<{ model?: string; platform?: string }>(
      `${baseUrl.replace(/\/+$/, '')}${prefix}/v1/capabilities`,
      { authorization: `Bearer ${apiKey}` }
    )
    return { ok: true, detail: capabilities.model ?? capabilities.platform ?? 'reachable' }
  } catch (error: unknown) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

export async function runInit(context: CliContext): Promise<void> {
  p.intro(BRAND(' Parallax — connect this machine to your agents '))

  const existing = await context.loadStoredConfig()

  // ── Cloud ────────────────────────────────────────────────
  p.log.step('Parallax cloud')
  const cloudBaseUrl = assertNotCancel(
    await requiredText(
      'Cloud API base URL',
      existing.cloud?.baseUrl ?? '',
      'https://parallax-cloud.up.railway.app'
    )
  ).trim()

  const cloudApiKey = assertNotCancel(
    await p.password({
      message: 'Runner API key (prx_rnr_…)',
      validate: (value) =>
        value?.startsWith('prx_rnr_')
          ? undefined
          : 'Expected a runner key. Create one with the cloud org:create command.',
    })
  )

  const runnerName = assertNotCancel(
    await requiredText('Name for this runner', existing.cloud?.runnerName ?? 'cerebro')
  ).trim()

  // ── Hermes ───────────────────────────────────────────────
  p.log.step('Hermes gateway')
  const hermesBaseUrl = assertNotCancel(
    await requiredText(
      'Hermes API server base URL',
      existing.hermes?.baseUrl ?? 'http://127.0.0.1:8642'
    )
  ).trim()

  p.note(
    [
      'Each profile needs its own API_SERVER_KEY.',
      'With gateway.multiplex_profiles enabled, the default profile’s key is',
      'rejected on /p/<profile> routes, so a shared key will not work.',
      '',
      'Keys live in ~/.hermes/profiles/<name>/.env (default: ~/.hermes/.env).',
    ].join('\n'),
    'Before you continue'
  )

  const profiles: HermesProfileConfig[] = []
  for (;;) {
    const name = assertNotCancel(
      await requiredText(
        profiles.length === 0 ? 'Hermes profile name' : 'Another profile name',
        profiles.length === 0 ? 'default' : ''
      )
    ).trim()

    if (profiles.some((profile) => profile.name === name)) {
      p.log.warn(`Profile "${name}" was already added.`)
      continue
    }

    const apiKey = assertNotCancel(
      await p.password({
        message: `API_SERVER_KEY for "${name}"`,
        validate: (value) => (value?.trim() ? undefined : 'Required.'),
      })
    )

    const spinner = p.spinner()
    spinner.start(`Checking ${name}`)
    const probe = await probeProfile(hermesBaseUrl, name, apiKey)
    spinner.stop(probe.ok ? `${name}: ${probe.detail}` : `${name}: unreachable`)

    if (!probe.ok) {
      p.log.error(probe.detail)
      const keep = assertNotCancel(
        await p.confirm({ message: 'Save this profile anyway?', initialValue: false })
      )
      if (!keep) {
        continue
      }
    }

    const role = assertNotCancel(
      await p.text({ message: `Role for "${name}" (optional)`, placeholder: 'product, reviewer…' })
    ).trim()

    const githubLogin = assertNotCancel(
      await p.text({
        message: `GitHub login for "${name}" (optional)`,
        placeholder: 'Needed only for PR-review routes',
      })
    ).trim()

    profiles.push({
      name,
      apiKey,
      enabled: true,
      ...(role ? { role } : {}),
      ...(githubLogin ? { githubLogin } : {}),
    })

    const more = assertNotCancel(
      await p.confirm({ message: 'Add another profile?', initialValue: false })
    )
    if (!more) {
      break
    }
  }

  // ── Secrets ──────────────────────────────────────────────
  const secrets = { ...existing.secrets }
  const needsLinear = assertNotCancel(
    await p.confirm({ message: 'Will any project pull from Linear?', initialValue: false })
  )
  if (needsLinear && !secrets.LINEAR_API_KEY) {
    secrets.LINEAR_API_KEY = assertNotCancel(
      await p.password({
        message: 'Linear API key',
        validate: (value) => (value?.trim() ? undefined : 'Required.'),
      })
    )
  }

  const config: StoredConfig = {
    version: CONFIG_VERSION,
    cloud: { baseUrl: cloudBaseUrl.replace(/\/+$/, ''), apiKey: cloudApiKey, runnerName },
    hermes: { baseUrl: hermesBaseUrl.replace(/\/+$/, ''), profiles },
    // Projects and routes are cloud-side configuration; the runner pulls them.
    projects: existing.projects,
    secrets,
    updatedAt: Date.now(),
  }

  p.note(
    [
      `Cloud:    ${config.cloud!.baseUrl}  (runner "${runnerName}")`,
      `Hermes:   ${config.hermes!.baseUrl}`,
      `Profiles: ${profiles.map((profile) => profile.name).join(', ')}`,
    ].join('\n'),
    'Configuration'
  )

  const confirmed = assertNotCancel(
    await p.confirm({ message: 'Save to ~/.parallax/config.json?', initialValue: true })
  )
  if (!confirmed) {
    p.cancel('Nothing was written.')
    return
  }

  await context.saveStoredConfig(config)

  p.outro(
    [
      BRAND('Saved.'),
      '',
      'Next:',
      '  parallax preflight        check this machine can reach everything',
      '  parallax start            run the orchestrator',
      '  parallax runner install   keep it running across reboots',
    ].join('\n')
  )
}
