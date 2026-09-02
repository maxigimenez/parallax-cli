/**
 * Checks that a clean install of the packed CLI has every package its bundled
 * code imports.
 *
 * `@parallax/common` and `@parallax/orchestrator` ship inside the tarball as
 * bundleDependencies, and prepare-package.mjs writes each a minimal manifest
 * with no `dependencies`. npm therefore never learns that the orchestrator
 * needs p-limit, fastify and the rest: the install succeeds, and the first
 * `parallax start` on a user's machine dies with ERR_MODULE_NOT_FOUND. That is
 * exactly what shipped in 0.2.0.
 *
 * Presence, not resolution. Resolving a specifier on another package's behalf
 * needs a resolver rooted at that package — `import.meta.resolve` takes no
 * parent argument on modern Node and would resolve everything relative to this
 * file — and importing the modules to find out would execute them.
 *
 * Run from a directory where the tarball has been npm-installed:
 *   npm init -y && npm install parallax-cli-x.y.z.tgz
 *   node verify-bundled-imports.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'

// Builtins resolve without being installed, and older code imports some of them
// unprefixed ("child_process" rather than "node:child_process").
const BUILTIN = new Set(builtinModules)

const BUNDLE = 'node_modules/parallax-cli/node_modules'
const SEARCH = ['node_modules', BUNDLE]

const files = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.js') ? [full] : []
  })

/** "@scope/name/sub" -> "@scope/name"; "p-limit/x" -> "p-limit". */
const packageName = (specifier) => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const missing = new Map()
for (const scoped of readdirSync(join(BUNDLE, '@parallax'))) {
  for (const file of files(join(BUNDLE, '@parallax', scoped))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(
      /(?:^|\s)(?:import|export)[^;]*?from\s+["']([^."'][^"']*)["']/g
    )) {
      const specifier = match[1]
      if (specifier.startsWith('node:')) continue
      const name = packageName(specifier)
      if (BUILTIN.has(name)) continue
      if (!SEARCH.some((dir) => existsSync(join(dir, name)))) {
        missing.set(name, file)
      }
    }
  }
}

if (missing.size > 0) {
  console.error(
    'UNRESOLVED after a clean install:\n  ' +
      [...missing].map(([name, file]) => `${name}  (imported by ${file})`).join('\n  ')
  )
  process.exit(1)
}
console.log('Every package the bundled code imports is installed.')
