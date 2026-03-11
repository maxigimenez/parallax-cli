import fs from 'node:fs/promises'
import { lstatSync, readlinkSync } from 'node:fs'
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
      version: '0.0.3',
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
      version: '0.0.3',
      type: 'module',
    },
  },
  {
    name: '@parallax/ui',
    sourceDir: path.join(workspaceRoot, 'packages/ui'),
    packageJson: {
      name: '@parallax/ui',
      version: '0.0.3',
      type: 'module',
    },
  },
]

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

async function main() {
  runPnpm(['--filter', '@parallax/common', 'build'])
  runPnpm(['--filter', '@parallax/orchestrator', 'build'])
  runPnpm(['--filter', '@parallax/ui', 'build'])
  runPnpm(['--filter', 'parallax-cli', 'build'])

  const cliPackageJson = JSON.parse(await fs.readFile(cliPackageJsonPath, 'utf8'))
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
      '@parallax/ui': bundledPackages[2].packageJson.version,
    },
  }
  await fs.writeFile(cliPackageJsonPath, JSON.stringify(rewrittenCliPackageJson, null, 2) + '\n')

  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2))
}

await main()
