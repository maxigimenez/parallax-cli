import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { parseStartOptions } from '../args.js'
import {
  isProcessAlive,
  readFileTail,
  spawnDetached,
  startSpinner,
  stopProcessBestEffort,
  waitForUrlHealth,
} from '../process.js'
import type { CliContext } from '../types.js'

const requireFromCli = createRequire(import.meta.url)

function resolveOrchestratorEntryPoint(rootDir: string): string {
  const packageCandidates = [
    '@parallax/orchestrator/dist/orchestrator/src/index.js',
    '@parallax/orchestrator/dist/index.js',
  ]
  for (const candidate of packageCandidates) {
    try {
      return requireFromCli.resolve(candidate)
    } catch {
      continue
    }
  }

  const localCandidates = [
    path.resolve(rootDir, 'packages/orchestrator/dist/orchestrator/src/index.js'),
    path.resolve(rootDir, 'packages/orchestrator/dist/index.js'),
  ]
  for (const candidate of localCandidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'Unable to resolve orchestrator runtime. Build dependencies first or reinstall parallax package.'
  )
}

export async function runStart(args: string[], context: CliContext) {
  const CYAN = '\x1b[36m'
  const BLUE = '\x1b[34m'
  const GREEN = '\x1b[32m'
  const YELLOW = '\x1b[33m'
  const DIM = '\x1b[2m'
  const RESET = '\x1b[0m'

  const options = parseStartOptions(args)
  const dataDir = context.defaultDataDir

  await fs.mkdir(dataDir, { recursive: true })

  console.log('')
  console.log(`${CYAN}⏳ Initializing Parallax...${RESET}`)
  console.log(`${BLUE}📁 Data Dir:${RESET} ${DIM}${dataDir}${RESET}`)
  console.log('')

  const registry = await context.loadRegistry()
  const env = context.buildEnvConfig(dataDir, {
    apiPort: options.apiPort,
    uiPort: options.uiPort,
    concurrency: options.concurrency,
  })
  const workspaceDevMode = process.env.NODE_ENV === 'dev'
  const orchestratorStdoutPath = path.join(dataDir, 'orchestrator.stdout.log')
  const orchestratorStderrPath = path.join(dataDir, 'orchestrator.stderr.log')
  const uiStdoutPath = path.join(dataDir, 'ui.stdout.log')
  const uiStderrPath = path.join(dataDir, 'ui.stderr.log')
  const spinner = startSpinner('Starting Parallax...')

  let orchestratorPid = 0
  let uiPid = 0

  try {
    const existingManifestPath = path.join(dataDir, context.manifestFile)
    if (await context.ensureFileExists(existingManifestPath)) {
      const existingState = await context.loadRunningState().catch(() => undefined)
      const existingUiAlive =
        existingState?.uiPid !== undefined ? isProcessAlive(existingState.uiPid) : false
      if (existingState && (isProcessAlive(existingState.orchestratorPid) || existingUiAlive)) {
        throw new Error(
          `Parallax is already running. Stop it first with "parallax stop". Manifest: ${existingManifestPath}`
        )
      }

      await fs.unlink(existingManifestPath).catch(() => undefined)
    }

    if (workspaceDevMode) {
      orchestratorPid = spawnDetached(
        process.execPath,
        [
          '--import',
          'tsx',
          path.resolve(context.rootDir, 'packages/orchestrator/src/index.ts'),
        ],
        context.rootDir,
        env,
        {
          stdoutPath: orchestratorStdoutPath,
          stderrPath: orchestratorStderrPath,
        }
      )

      uiPid = spawnDetached(
        'pnpm',
        ['--filter', '@parallax/ui', 'start', '--', '--host', '0.0.0.0', '--port', String(options.uiPort)],
        context.rootDir,
        {
          VITE_PARALLAX_API_BASE: `http://localhost:${options.apiPort}`,
        },
        {
          stdoutPath: uiStdoutPath,
          stderrPath: uiStderrPath,
        }
      )
    } else {
      orchestratorPid = spawnDetached(
        process.execPath,
        [resolveOrchestratorEntryPoint(context.rootDir)],
        process.cwd(),
        env,
        {
          stdoutPath: orchestratorStdoutPath,
          stderrPath: orchestratorStderrPath,
        }
      )
    }

    if (orchestratorPid <= 0) {
      throw new Error('Failed to spawn orchestrator process.')
    }

    if (workspaceDevMode && uiPid <= 0) {
      throw new Error('Failed to spawn UI process.')
    }

    await waitForUrlHealth(`http://localhost:${options.apiPort}/tasks`, 'Orchestrator API')
    await waitForUrlHealth(`http://localhost:${options.uiPort}`, 'Parallax UI')

    await fs.writeFile(
      path.join(dataDir, context.manifestFile),
      JSON.stringify(
        {
          startedAt: Date.now(),
          orchestratorPid,
          uiPid: uiPid || undefined,
          apiPort: options.apiPort,
          uiPort: options.uiPort,
        },
        null,
        2
      )
    )

    console.log('')
    console.log('')
    console.log(`${GREEN}✓ Parallax started in background.${RESET}`)
    console.log(`${DIM}Orchestrator PID:${RESET} ${orchestratorPid}`)
    console.log(`${DIM}Dashboard:${RESET} http://localhost:${options.uiPort}`)
    console.log(`${DIM}Registered Configs:${RESET} ${registry.configs.length}`)
    console.log('')
    console.log('')
    console.log(
      `${YELLOW}💡 Register a repository config with:${RESET} ${DIM}parallax register <config-file>${RESET}`
    )
    console.log('')
    console.log('')
  } catch (error) {
    const processAlive = orchestratorPid > 0 ? isProcessAlive(orchestratorPid) : false
    await stopProcessBestEffort(orchestratorPid, 'orchestrator', true)
    await stopProcessBestEffort(uiPid, 'ui', true)
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}

Startup diagnostics:
- orchestrator PID: ${orchestratorPid || 'n/a'}
- ui PID: ${uiPid || 'n/a'}
- process alive at failure: ${processAlive ? 'yes' : 'no'}
- stdout log: ${orchestratorStdoutPath}
- stderr log: ${orchestratorStderrPath}
- ui stdout log: ${uiStdoutPath}
- ui stderr log: ${uiStderrPath}

Recent stderr:
${await readFileTail(orchestratorStderrPath, context.ensureFileExists)}

Recent stdout:
${await readFileTail(orchestratorStdoutPath, context.ensureFileExists)}

Recent UI stderr:
${await readFileTail(uiStderrPath, context.ensureFileExists)}

Recent UI stdout:
${await readFileTail(uiStdoutPath, context.ensureFileExists)}`
    )
  } finally {
    spinner?.stop()
  }
}
