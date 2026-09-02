import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// This package is ESM, where bare `require` does not exist. Without this the
// capability probe below throws ReferenceError and reports every runtime as
// incapable -- including the one it just re-executed into.
const require = createRequire(import.meta.url)

/**
 * Finding a Node that can actually run Parallax.
 *
 * Installing globally under a version manager scopes the command to whichever
 * Node was active at install time. Switch versions and `parallax` either
 * vanishes from PATH or — worse — runs under an interpreter that cannot load
 * `node:sqlite`, failing deep inside the database layer with an error that says
 * nothing about Node versions.
 *
 * So this does not check a version number. It checks the one capability that
 * actually matters and re-execs under an interpreter that has it. A capability
 * probe stays correct when `node:sqlite` stops being experimental, or when it
 * lands in a runtime that reports a version we have never heard of.
 */

/** Node 22.x needs this; 23+ accepts and ignores it. One invocation fits all. */
export const SQLITE_FLAG = '--experimental-sqlite'

/** Set on a re-exec so a broken probe cannot loop forever. */
const REEXEC_GUARD = 'PARALLAX_RUNTIME_REEXEC'

/**
 * Script a candidate must run to prove it is a Node with node:sqlite.
 *
 * The expected answer is a nonce read from the environment, never written into
 * the arguments. Exit status alone would accept anything that exits 0, and a
 * literal sentinel in the script would be echoed back verbatim by something
 * like `/bin/echo`. Only a process that actually evaluated this can print a
 * value it was never given on the command line.
 */
const PROBE_ENV = 'PARALLAX_PROBE_NONCE'
const PROBE = `if (typeof require("node:sqlite").DatabaseSync === "function") console.log(process.env.${PROBE_ENV})`

export function currentRuntimeIsCapable(): boolean {
  // Loading node:sqlite is the probe, but it emits an ExperimentalWarning that
  // would then print on every single CLI invocation. Silence just this one
  // load rather than the process's warnings generally.
  const emit = process.emitWarning
  // process.emitWarning is heavily overloaded, so the stand-in is typed as the
  // base callable and reinstated in `finally`.
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string })?.type
    if (type === 'ExperimentalWarning' || String(warning).includes('SQLite is an experimental')) {
      return
    }
    ;(emit as (...args: unknown[]) => void)(warning, ...rest)
  }) as typeof process.emitWarning

  try {
    return typeof require('node:sqlite').DatabaseSync === 'function'
  } catch {
    return false
  } finally {
    process.emitWarning = emit
  }
}

/** Runs a candidate interpreter and asks whether it can open a database. */
export function probeNode(binary: string): boolean {
  try {
    const nonce = randomBytes(8).toString('hex')
    const result = spawnSync(binary, [SQLITE_FLAG, '-e', PROBE], {
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, [PROBE_ENV]: nonce },
    })
    return result.status === 0 && (result.stdout ?? '').includes(nonce)
  } catch {
    return false
  }
}

function versionOf(binary: string): string | undefined {
  try {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5_000 })
    return result.status === 0 ? result.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * Candidate interpreters, best first.
 *
 * The recorded choice comes first so a working setup keeps using the same Node
 * across restarts, then this process, then the version managers and package
 * managers people actually have. Version-manager directories are searched
 * newest-first by numeric version, not lexically, so v9 does not beat v10.
 */
export function candidateNodePaths(dataDir: string): string[] {
  const candidates: string[] = []

  const recorded = readRecordedNode(dataDir)
  if (recorded) {
    candidates.push(recorded)
  }
  candidates.push(process.execPath)

  const versionDirs = [
    path.join(os.homedir(), '.nvm', 'versions', 'node'),
    path.join(os.homedir(), '.local', 'share', 'fnm', 'node-versions'),
    path.join(os.homedir(), 'Library', 'Application Support', 'fnm', 'node-versions'),
    path.join(os.homedir(), '.volta', 'tools', 'image', 'node'),
    path.join(os.homedir(), '.asdf', 'installs', 'nodejs'),
  ]

  for (const dir of versionDirs) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }

    const sorted = entries
      .map((name) => ({ name, parts: parseVersion(name) }))
      .filter((entry) => entry.parts !== undefined)
      .sort((a, b) => compareVersions(b.parts!, a.parts!))

    for (const entry of sorted) {
      // fnm and asdf nest the install one level deeper than nvm does.
      candidates.push(
        path.join(dir, entry.name, 'bin', 'node'),
        path.join(dir, entry.name, 'installation', 'bin', 'node')
      )
    }
  }

  candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node')

  return [...new Set(candidates)].filter((candidate) => {
    try {
      return fs.statSync(candidate).isFile()
    } catch {
      return false
    }
  })
}

function parseVersion(name: string): number[] | undefined {
  const match = name.match(/^v?(\d+)\.(\d+)\.(\d+)/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i]
    }
  }
  return 0
}

export interface ResolvedRuntime {
  binary: string
  version?: string
}

/** First candidate that passes the probe, or undefined if this machine has none. */
export function findCapableNode(dataDir: string): ResolvedRuntime | undefined {
  for (const binary of candidateNodePaths(dataDir)) {
    if (probeNode(binary)) {
      return { binary, version: versionOf(binary) }
    }
  }
  return undefined
}

// ── Recording the choice ────────────────────────────────────────────────────

function recordPath(dataDir: string): string {
  return path.join(dataDir, 'node-runtime.json')
}

export function readRecordedNode(dataDir: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(recordPath(dataDir), 'utf8')) as { binary?: string }
    return parsed.binary && fs.existsSync(parsed.binary) ? parsed.binary : undefined
  } catch {
    return undefined
  }
}

export function recordNode(dataDir: string, runtime: ResolvedRuntime): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(
      recordPath(dataDir),
      JSON.stringify({ binary: runtime.binary, version: runtime.version }, null, 2)
    )
  } catch {
    // Losing the hint only costs a rediscovery next time.
  }
}

/**
 * Resolves the interpreter to launch the runner with.
 *
 * Long-running processes are started with an absolute path rather than
 * inheriting whatever `node` means later, so a version switch months from now
 * cannot break a daemon that is already installed and working.
 */
export function resolveRunnerNode(dataDir: string): ResolvedRuntime {
  if (currentRuntimeIsCapable()) {
    const runtime = { binary: process.execPath, version: process.version }
    recordNode(dataDir, runtime)
    return runtime
  }

  const found = findCapableNode(dataDir)
  if (!found) {
    throw new Error(unsupportedRuntimeMessage())
  }
  recordNode(dataDir, found)
  return found
}

export function unsupportedRuntimeMessage(afterReexec = false): string {
  return [
    `This Node (${process.version}) cannot load node:sqlite, which Parallax needs.`,
    '',
    afterReexec
      ? 'Parallax already switched interpreters once and still could not load it,'
      : 'No usable Node was found on this machine,',
    'so it is giving up rather than failing later somewhere less obvious.',
    '',
    'Node 22.5 or newer works (22.x needs --experimental-sqlite, which Parallax',
    'passes for you). Install or select one, for example:',
    '',
    '  nvm install 24 && nvm use 24',
  ].join('\n')
}

/**
 * Re-executes this CLI under a capable interpreter when the current one is not.
 *
 * Returns false when the process should simply carry on. Anything else either
 * exits or throws, so the caller never continues on a runtime that will fail
 * later, in a place that gives no clue why.
 */
export function ensureCapableRuntime(dataDir: string, entryScript: string): boolean {
  if (currentRuntimeIsCapable()) {
    return false
  }

  if (process.env[REEXEC_GUARD]) {
    // Already re-executed once and still not capable: stop rather than loop.
    throw new Error(unsupportedRuntimeMessage(true))
  }

  const capable = findCapableNode(dataDir)
  if (!capable) {
    throw new Error(unsupportedRuntimeMessage())
  }

  recordNode(dataDir, capable)

  const result = spawnSync(
    capable.binary,
    [SQLITE_FLAG, '--disable-warning=ExperimentalWarning', entryScript, ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, [REEXEC_GUARD]: '1' } }
  )

  process.exit(result.status ?? 1)
}
