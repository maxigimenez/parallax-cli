import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { hasFlag, parseArgValue, parseOptionalArg } from '../args.js'
import { resolveEnvFilePath, validateConfigFile } from '../config.js'
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
  const DIM = '\x1b[2m'
  const RESET = '\x1b[0m'

  const configArg = hasFlag(args, 'config') ? parseArgValue(args, 'config') : undefined
  const dataDir = context.resolvePath(parseOptionalArg(args, 'data-dir') ?? context.defaultDataDir)
  const configPath = configArg ? context.resolvePath(configArg) : context.defaultConfigPath
  const envFilePath = await resolveEnvFilePath(
    parseOptionalArg(args, 'env-file'),
    context.resolvePath,
    context.ensureFileExists
  )

  await fs.mkdir(dataDir, { recursive: true })

  console.log('')
  console.log(`${CYAN}⏳ Initializing Parallax...${RESET}`)
  console.log(`${BLUE}📄 Config:${RESET} ${DIM}${configPath}${RESET}`)
  console.log(`${BLUE}📁 Data Dir:${RESET} ${DIM}${dataDir}${RESET}`)
  console.log('')

  if (!(await context.ensureFileExists(configPath))) {
    throw new Error(`Config path not found: ${configPath}`)
  }

  await validateConfigFile(configPath)
  const server = await context.resolveServerPorts(configPath)
  const env = context.buildEnvConfig(configPath, dataDir)
  const workspaceDevMode = process.env.NODE_ENV === 'dev'
  const orchestratorStdoutPath = path.join(dataDir, 'orchestrator.stdout.log')
  const orchestratorStderrPath = path.join(dataDir, 'orchestrator.stderr.log')
  const uiStdoutPath = path.join(dataDir, 'ui.stdout.log')
  const uiStderrPath = path.join(dataDir, 'ui.stderr.log')
  const spinner = startSpinner('Starting Parallax...')

  let orchestratorPid = 0
  let uiPid = 0

  try {
    if (workspaceDevMode) {
      orchestratorPid = spawnDetached(
        process.execPath,
        [
          ...(envFilePath ? [`--env-file=${envFilePath}`] : []),
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
        ['--filter', '@parallax/ui', 'start', '--', '--host', '0.0.0.0', '--port', String(server.uiPort)],
        context.rootDir,
        {
          VITE_PARALLAX_API_BASE: `http://localhost:${server.apiPort}`,
        },
        {
          stdoutPath: uiStdoutPath,
          stderrPath: uiStderrPath,
        }
      )
    } else {
      orchestratorPid = spawnDetached(
        process.execPath,
        [...(envFilePath ? [`--env-file=${envFilePath}`] : []), resolveOrchestratorEntryPoint(context.rootDir)],
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

    await waitForUrlHealth(`http://localhost:${server.apiPort}/tasks`, 'Orchestrator API')
    await waitForUrlHealth(`http://localhost:${server.uiPort}`, 'Parallax UI')

    await fs.writeFile(
      path.join(dataDir, context.manifestFile),
      JSON.stringify(
        {
          startedAt: Date.now(),
          configPath,
          dataDir,
          orchestratorPid,
          uiPid: uiPid || undefined,
        },
        null,
        2
      )
    )

    console.log(`${GREEN}✓ Parallax started in background.${RESET}`)
    console.log(`${DIM}Orchestrator PID:${RESET} ${orchestratorPid}`)
    console.log(`${DIM}Dashboard:${RESET} http://localhost:${server.uiPort}`)
    console.log(`${DIM}API:${RESET} http://localhost:${server.apiPort}`)
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
