import fs from 'node:fs/promises'
import { lstatSync, readlinkSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cliDir = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(cliDir, '..', '..')
const backupPath = path.join(cliDir, '.pack-backup.json')
const cliPackageJsonPath = path.join(cliDir, 'package.json')

const bundledPackages = [
  {
    name: '@parallax/common',
    sourceDir: path.join(workspaceRoot, 'packages/common'),
    packageJson: {
      name: '@parallax/common',
      version: '0.0.4',
      type: 'module',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
        },
        './executor': {
          types: './dist/executor.d.ts',
          import: './dist/executor.js',
        },
      },
    },
  },
  {
    name: '@parallax/orchestrator',
    sourceDir: path.join(workspaceRoot, 'packages/orchestrator'),
    packageJson: {
      name: '@parallax/orchestrator',
      version: '0.0.4',
      type: 'module',
    },
  },
]

// Pin each bundled package to its real workspace version so the published
// package.json, the flattened bundled package.json, and the rewritten cli
// dependency ranges all stay consistent across releases.
for (const metadata of bundledPackages) {
  const { version } = JSON.parse(
    readFileSync(path.join(metadata.sourceDir, 'package.json'), 'utf8')
  )
  metadata.packageJson.version = version
}

function runPnpm(args) {
  execFileSync('pnpm', ['--dir', workspaceRoot, ...args], {
    stdio: 'inherit',
    cwd: workspaceRoot,
  })
}

async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(sourceDir, targetDir, { recursive: true })
}

function targetDirForPackage(packageName) {
  return path.join(cliDir, 'node_modules', ...packageName.split('/'))
}

async function backupExistingTarget(targetDir) {
  try {
    const stats = lstatSync(targetDir)
    if (stats.isSymbolicLink()) {
      return {
        kind: 'symlink',
        target: readlinkSync(targetDir),
      }
    }

    return { kind: 'directory' }
  } catch {
    return { kind: 'missing' }
  }
}

async function writeBundledPackage(metadata) {
  const targetDir = targetDirForPackage(metadata.name)
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(targetDir, { recursive: true })
  await fs.writeFile(
    path.join(targetDir, 'package.json'),
    JSON.stringify(metadata.packageJson, null, 2)
  )
  await copyDirectory(path.join(metadata.sourceDir, 'dist'), path.join(targetDir, 'dist'))
}

/**
 * Refuses to pack a tarball that would fail on a user's machine.
 *
 * Each bundled package is written a minimal manifest with no `dependencies`, so
 * npm never learns that the orchestrator needs p-limit, fastify and the rest.
 * The host package is the only place they can be declared, and if they are not,
 * the install succeeds and the first `parallax start` dies with
 * ERR_MODULE_NOT_FOUND. That shipped in 0.2.0.
 *
 * The same rule is asserted in `test/bundled-dependencies.test.ts`, which runs
 * on every PR. This is the last gate before a tarball is written.
 */
function assertBundledDependenciesAreDeclared(cliPackageJson) {
  const declared = cliPackageJson.dependencies ?? {}
  const problems = []

  for (const metadata of bundledPackages) {
    const source = JSON.parse(readFileSync(path.join(metadata.sourceDir, 'package.json'), 'utf8'))
    for (const [name, range] of Object.entries(source.dependencies ?? {})) {
      if (name.startsWith('@parallax/')) {
        continue
      }
      if (!declared[name]) {
        problems.push(`  ${name}@${range} — needed by ${metadata.name}, missing from the cli`)
      } else if (declared[name] !== range) {
        problems.push(`  ${name} — cli declares ${declared[name]}, ${metadata.name} needs ${range}`)
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `packages/cli/package.json must declare every third-party dependency of the\n` +
        `packages it bundles, because a bundled package ships without its own:\n\n` +
        problems.join('\n') +
        `\n\nAdd them to "dependencies" in packages/cli/package.json.`
    )
  }
}

async function main() {
  runPnpm(['--filter', '@parallax/common', 'build'])
  runPnpm(['--filter', '@parallax/orchestrator', 'build'])
  runPnpm(['--filter', 'parallax-cli', 'build'])

  const cliPackageJson = JSON.parse(await fs.readFile(cliPackageJsonPath, 'utf8'))
  assertBundledDependenciesAreDeclared(cliPackageJson)

  const backup = {
    cliPackageJson,
    packages: {},
  }
  for (const metadata of bundledPackages) {
    const targetDir = targetDirForPackage(metadata.name)
    backup.packages[metadata.name] = await backupExistingTarget(targetDir)
    await writeBundledPackage(metadata)
  }

  const rewrittenCliPackageJson = {
    ...cliPackageJson,
    dependencies: {
      ...cliPackageJson.dependencies,
      '@parallax/common': bundledPackages[0].packageJson.version,
      '@parallax/orchestrator': bundledPackages[1].packageJson.version,
    },
  }
  await fs.writeFile(cliPackageJsonPath, JSON.stringify(rewrittenCliPackageJson, null, 2) + '\n')

  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2))
}

await main()
