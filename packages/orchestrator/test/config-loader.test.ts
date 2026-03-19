import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../src/config-loader'

const originalCwd = process.cwd()
const originalDataDir = process.env.PARALLAX_DATA_DIR
const originalConcurrency = process.env.PARALLAX_CONCURRENCY
const originalApiPort = process.env.PARALLAX_SERVER_API_PORT
const originalUiPort = process.env.PARALLAX_SERVER_UI_PORT

afterEach(async () => {
  process.chdir(originalCwd)
  if (originalDataDir === undefined) {
    delete process.env.PARALLAX_DATA_DIR
  } else {
    process.env.PARALLAX_DATA_DIR = originalDataDir
  }
  if (originalConcurrency === undefined) {
    delete process.env.PARALLAX_CONCURRENCY
  } else {
    process.env.PARALLAX_CONCURRENCY = originalConcurrency
  }
  if (originalApiPort === undefined) {
    delete process.env.PARALLAX_SERVER_API_PORT
  } else {
    process.env.PARALLAX_SERVER_API_PORT = originalApiPort
  }
  if (originalUiPort === undefined) {
    delete process.env.PARALLAX_SERVER_UI_PORT
  } else {
    process.env.PARALLAX_SERVER_UI_PORT = originalUiPort
  }
})

describe('config-loader', () => {
  it('returns empty config when registry is missing', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    process.env.PARALLAX_DATA_DIR = dataDir

    const config = await loadConfig()
    expect(config.projects).toHaveLength(0)
    expect(config.server.apiPort).toBe(3000)
    expect(config.server.uiPort).toBe(8080)
    expect(config.concurrency).toBe(2)
  })

  it('loads a strict valid config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = path.join(root, '.parallax')
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    const registryPath = path.join(dataDir, 'registry.json')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        '- id: test',
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    provider: codex',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )

    process.env.PARALLAX_DATA_DIR = dataDir
    process.env.PARALLAX_CONCURRENCY = '4'
    process.env.PARALLAX_SERVER_API_PORT = '4100'
    process.env.PARALLAX_SERVER_UI_PORT = '4101'
    process.chdir(root)

    const config = await loadConfig()
    expect(config.projects).toHaveLength(1)
    expect(config.concurrency).toBe(4)
    expect(config.server.apiPort).toBe(4100)
    expect(config.server.uiPort).toBe(4101)
    expect(config.projects[0].id).toBe('test')
  })

  it('attaches registered env file path to the project config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = path.join(root, '.parallax')
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    const envFilePath = path.join(root, '.env')
    const registryPath = path.join(dataDir, 'registry.json')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(envFilePath, 'TEST_VALUE=1\n')
    await fs.writeFile(
      configPath,
      [
        '- id: test',
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    provider: codex',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, envFilePath, addedAt: Date.now() }] }, null, 2)
    )

    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    const config = await loadConfig()
    expect(config.projects[0].envFilePath).toBe(envFilePath)
  })

  it('accepts claude-code as a supported agent provider', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = path.join(root, '.parallax')
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    const registryPath = path.join(dataDir, 'registry.json')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        '- id: test',
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    provider: claude-code',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )

    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    const config = await loadConfig()
    expect(config.projects[0].agent.provider).toBe('claude-code')
  })

  it('rejects unsupported agent provider', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = path.join(root, '.parallax')
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    const registryPath = path.join(dataDir, 'registry.json')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        '- id: test',
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    provider: unknown-agent',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )

    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    await expect(loadConfig()).rejects.toThrow('Unsupported agent provider "unknown-agent"')
  })

  it('rejects unknown agent fields', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = path.join(root, '.parallax')
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    const registryPath = path.join(dataDir, 'registry.json')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        '- id: test',
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    provider: codex',
        '    sandbox: true',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )

    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    await expect(loadConfig()).rejects.toThrow('project.agent for "test" in')
  })
})
