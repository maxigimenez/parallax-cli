import fs from 'node:fs/promises'
import { parseRegisterOptions } from '../args.js'
import { isProcessAlive } from '../process.js'
import type { CliContext } from '../types.js'

async function reloadRunningRuntime(context: CliContext) {
  let state
  try {
    state = await context.loadRunningState()
  } catch {
    return false
  }

  if (!isProcessAlive(state.orchestratorPid)) {
    return false
  }

  const response = await fetch(`http://localhost:${state.apiPort}/runtime/reload`, {
    method: 'POST',
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined
    throw new Error(payload?.error ?? `Failed to reload running Parallax instance (${response.status}).`)
  }

  return true
}

async function saveRegistryAndReload(
  context: CliContext,
  previousRegistry: Awaited<ReturnType<CliContext['loadRegistry']>>,
  nextRegistry: Awaited<ReturnType<CliContext['loadRegistry']>>
) {
  await context.saveRegistry(nextRegistry)

  try {
    return await reloadRunningRuntime(context)
  } catch (error) {
    await context.saveRegistry(previousRegistry)
    throw error
  }
}

export async function runRegister(
  args: string[],
  context: CliContext,
  command: 'register' | 'unregister'
) {
  const options = parseRegisterOptions(args, command)
  const configPath = context.resolvePath(options.configPath)
  const envFilePath = options.envFilePath ? context.resolvePath(options.envFilePath) : undefined

  await fs.mkdir(context.defaultDataDir, { recursive: true })

  if (command === 'register') {
    if (!(await context.ensureFileExists(configPath))) {
      throw new Error(`Config file not found: ${configPath}`)
    }
    if (envFilePath && !(await context.ensureFileExists(envFilePath))) {
      throw new Error(`Env file not found: ${envFilePath}`)
    }

    await context.validateConfigFile(configPath)
    const registry = await context.loadRegistry()
    if (registry.configs.some((entry) => entry.configPath === configPath)) {
      console.log(`Already registered: ${configPath}`)
      return
    }

    const nextRegistry = {
      configs: [...registry.configs, { configPath, envFilePath, addedAt: Date.now() }],
    }
    const reloaded = await saveRegistryAndReload(context, registry, nextRegistry)
    console.log(`Registered: ${configPath}`)
    if (reloaded) {
      console.log('Reloaded running Parallax instance.')
    }
    return
  }

  const registry = await context.loadRegistry()
  const nextConfigs = registry.configs.filter((entry) => entry.configPath !== configPath)
  if (nextConfigs.length === registry.configs.length) {
    throw new Error(`Config is not registered: ${configPath}`)
  }

  const nextRegistry = { configs: nextConfigs }
  const reloaded = await saveRegistryAndReload(context, registry, nextRegistry)
  console.log(`Unregistered: ${configPath}`)
  if (reloaded) {
    console.log('Reloaded running Parallax instance.')
  }
}
