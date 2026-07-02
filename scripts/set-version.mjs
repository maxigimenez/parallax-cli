import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Sets a single version across the whole workspace: the root package, every
// package under packages/*, and the internal @parallax/* dependency pins in the
// published cli package. Keeping these in lockstep is required because the
// @parallax/* packages are unpublished — the cli links them from the workspace
// by version (link-workspace-packages=true), so a stale pin would fall back to
// the npm registry and fail to resolve.
//
// Usage: node scripts/set-version.mjs <version>

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..')

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Usage: node scripts/set-version.mjs <version>\nGot: ${version ?? '(none)'}`)
  process.exit(1)
}

const packagesDir = path.join(workspaceRoot, 'packages')
const packageJsonPaths = [
  path.join(workspaceRoot, 'package.json'),
  ...fs
    .readdirSync(packagesDir)
    .map((name) => path.join(packagesDir, name, 'package.json'))
    .filter((p) => fs.existsSync(p)),
]

const internalPrefix = '@parallax/'

for (const pkgPath of packageJsonPaths) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.version = version

  // Re-pin any non-workspace internal dependency ranges to the new version.
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[field]
    if (!deps) continue
    for (const name of Object.keys(deps)) {
      if (name.startsWith(internalPrefix) && !deps[name].startsWith('workspace:')) {
        deps[name] = version
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`${path.relative(workspaceRoot, pkgPath)} -> ${version}`)
}
