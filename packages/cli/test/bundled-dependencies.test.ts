import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd(), '..', '..')

function manifest(relative: string): {
  dependencies?: Record<string, string>
  bundleDependencies?: string[]
} {
  return JSON.parse(readFileSync(join(ROOT, relative, 'package.json'), 'utf8'))
}

const cli = manifest('packages/cli')
const BUNDLED = ['packages/common', 'packages/orchestrator']

/**
 * The published CLI must declare what its bundled packages need.
 *
 * `@sentinel0/common` and `@sentinel0/orchestrator` ship inside the tarball as
 * `bundleDependencies`, and `prepare-package.mjs` writes each one a minimal
 * manifest carrying no `dependencies` at all. npm therefore never learns that
 * the orchestrator needs `p-limit`, `fastify` and the rest — nothing installs
 * them, and the first `sentinel0 start` on a user's machine dies with
 * ERR_MODULE_NOT_FOUND.
 *
 * That shipped in 0.2.0. It survived a pack-install-and-run check because
 * `--version` and `preflight` never reach the orchestrator's entry point, so
 * the import that fails is never evaluated.
 *
 * The host package is the only place these can be declared, so this asserts the
 * two lists agree. It is a manifest comparison rather than an install, so it
 * runs in the normal test suite rather than only at publish time.
 */
describe('bundled dependencies', () => {
  it('bundles exactly the internal packages', () => {
    expect(cli.bundleDependencies).toEqual(['@sentinel0/common', '@sentinel0/orchestrator'])
  })

  it('declares every third-party dependency of every bundled package', () => {
    const missing: string[] = []

    for (const relative of BUNDLED) {
      const deps = manifest(relative).dependencies ?? {}
      for (const [name, range] of Object.entries(deps)) {
        // Internal packages are bundled rather than resolved, so they are not
        // the CLI's problem beyond the pin it already carries.
        if (name.startsWith('@sentinel0/')) {
          continue
        }
        const declared = cli.dependencies?.[name]
        if (!declared) {
          missing.push(`${name}@${range} (needed by ${relative}, not declared by the cli)`)
        } else if (declared !== range) {
          missing.push(
            `${name}: cli declares ${declared}, ${relative} needs ${range} — a bundled ` +
              `package resolves against the cli's copy, so these must match`
          )
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('pins the internal packages by exact version, not a range', () => {
    for (const name of ['@sentinel0/common', '@sentinel0/orchestrator']) {
      expect(cli.dependencies?.[name], `${name} pin`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})
