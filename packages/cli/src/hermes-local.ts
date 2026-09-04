import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Reads the Hermes installation on this machine.
 *
 * `sentinel0 init` runs on the same host as Hermes, so the profiles and their
 * API server keys are already on disk. Reading them beats asking an operator to
 * copy four keys out of four dotfiles by hand, and it removes the most likely
 * setup mistake: pasting the default profile's key against a named profile,
 * which Hermes rejects only later, at dispatch time.
 *
 * Deliberately filesystem-based rather than shelling out to `hermes profile
 * list`: the directory layout is a documented contract, whereas CLI output
 * formatting is not.
 */

export interface LocalHermesProfile {
  name: string
  /** From that profile's own .env, when present. */
  apiKey?: string
  envPath: string
}

export interface LocalHermesInstall {
  home: string
  /** From the default profile's .env; the gateway-wide settings live there. */
  apiServerEnabled: boolean
  port?: string
  profiles: LocalHermesProfile[]
}

export function resolveHermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.hermes')
}

/** Minimal dotenv read: `KEY=value`, ignoring comments, quotes and `export`. */
export async function readEnvFile(file: string): Promise<Record<string, string>> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return {}
  }

  const values: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) {
      continue
    }
    const value = match[2].trim().replace(/\s+#.*$/, '')
    values[match[1]] = value.replace(/^["'](.*)["']$/, '$1')
  }
  return values
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Enumerates `default` plus every directory under `<home>/profiles`.
 *
 * Returns undefined when there is no Hermes home here at all, so the caller can
 * fall back to asking rather than reporting an empty fleet as if it were fact.
 */
export async function discoverLocalHermes(
  home: string = resolveHermesHome()
): Promise<LocalHermesInstall | undefined> {
  if (!(await isDirectory(home))) {
    return undefined
  }

  const rootEnvPath = path.join(home, '.env')
  const rootEnv = await readEnvFile(rootEnvPath)

  const profiles: LocalHermesProfile[] = [
    { name: 'default', apiKey: rootEnv.API_SERVER_KEY, envPath: rootEnvPath },
  ]

  const profilesDir = path.join(home, 'profiles')
  let entries: string[] = []
  try {
    entries = await fs.readdir(profilesDir)
  } catch {
    entries = []
  }

  for (const name of entries.sort()) {
    if (name.startsWith('.') || !(await isDirectory(path.join(profilesDir, name)))) {
      continue
    }
    const envPath = path.join(profilesDir, name, '.env')
    const env = await readEnvFile(envPath)
    profiles.push({ name, apiKey: env.API_SERVER_KEY, envPath })
  }

  return {
    home,
    apiServerEnabled: /^(1|true|yes|on)$/i.test(rootEnv.API_SERVER_ENABLED ?? ''),
    port: rootEnv.API_SERVER_PORT,
    profiles,
  }
}

export function defaultHermesBaseUrl(install?: LocalHermesInstall): string {
  return `http://127.0.0.1:${install?.port ?? '8642'}`
}
