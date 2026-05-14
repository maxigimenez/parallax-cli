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

  it('loads named agents defined in agents: item', async () => {
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
        '- agents:',
        '    - name: developer',
        '      provider: claude-code',
        '      model: claude-opus-4-5',
        '      systemPrompt: "You are a senior engineer."',
        `- id: test`,
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    name: developer',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )
    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    const config = await loadConfig()

    expect(config.agents).toHaveLength(1)
    expect(config.agents[0].name).toBe('developer')
    expect(config.agents[0].provider).toBe('claude-code')
    expect(config.agents[0].model).toBe('claude-opus-4-5')
    expect(config.agents[0].systemPrompt).toBe('You are a senior engineer.')
    expect(config.projects[0].agent.provider).toBe('claude-code')
    expect(config.projects[0].agent.name).toBe('developer')
    expect(config.projects[0].agent.systemPrompt).toBe('You are a senior engineer.')
  })

  it('loads agentLabels mapping on a project entry', async () => {
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
        '- agents:',
        '    - name: developer',
        '      provider: codex',
        '    - name: reviewer',
        '      provider: gemini',
        `- id: test`,
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    name: developer',
        '  agentLabels:',
        '    ai-frontend: reviewer',
        '    ai-security: reviewer',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )
    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    const config = await loadConfig()

    expect(config.projects[0].agentLabels).toEqual({
      'ai-frontend': 'reviewer',
      'ai-security': 'reviewer',
    })
  })

  it('rejects an agentLabels value that references an unknown agent', async () => {
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
        '- agents:',
        '    - name: developer',
        '      provider: codex',
        `- id: test`,
        `  workspaceDir: ${workspace}`,
        '  pullFrom:',
        '    provider: github',
        '    filters:',
        '      owner: org',
        '      repo: repo',
        '  agent:',
        '    name: developer',
        '  agentLabels:',
        '    ai-frontend: does-not-exist',
      ].join('\n')
    )
    await fs.writeFile(
      registryPath,
      JSON.stringify({ configs: [{ configPath, addedAt: Date.now() }] }, null, 2)
    )
    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    await expect(loadConfig()).rejects.toThrow('unknown agent "does-not-exist"')
  })

  it('loads slack config from slack: item', async () => {
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
        '- slack:',
        '    botToken: xoxb-test-token',
        '    appToken: xapp-test-token',
        '    channel: "#ai-tasks"',
        `- id: test`,
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
    process.chdir(root)

    const config = await loadConfig()

    expect(config.slack).toEqual({
      botToken: 'xoxb-test-token',
      appToken: 'xapp-test-token',
      channel: '#ai-tasks',
    })
  })

  it('rejects slack botToken that does not start with xoxb-', async () => {
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
        '- slack:',
        '    botToken: bad-token',
        '    appToken: xapp-test-token',
        '    channel: "#ai-tasks"',
        `- id: test`,
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
    process.chdir(root)

    await expect(loadConfig()).rejects.toThrow('xoxb-')
  })

  it('rejects duplicate agent names across registered configs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = path.join(root, '.parallax')
    const workspace = path.join(root, 'workspace')
    const configPath1 = path.join(root, 'parallax1.yml')
    const configPath2 = path.join(root, 'parallax2.yml')
    const registryPath = path.join(dataDir, 'registry.json')
    await fs.mkdir(workspace, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
    const agentBlock = ['- agents:', '    - name: developer', '      provider: codex'].join('\n')
    const projectBlock = [
      `- id: test-X`,
      `  workspaceDir: ${workspace}`,
      '  pullFrom:',
      '    provider: github',
      '    filters:',
      '      owner: org',
      '      repo: repo',
      '  agent:',
      '    provider: codex',
    ].join('\n')
    await fs.writeFile(configPath1, `${agentBlock}\n${projectBlock.replace('test-X', 'test-1')}`)
    await fs.writeFile(configPath2, `${agentBlock}\n${projectBlock.replace('test-X', 'test-2')}`)
    await fs.writeFile(
      registryPath,
      JSON.stringify(
        {
          configs: [
            { configPath: configPath1, addedAt: Date.now() },
            { configPath: configPath2, addedAt: Date.now() },
          ],
        },
        null,
        2
      )
    )
    process.env.PARALLAX_DATA_DIR = dataDir
    process.chdir(root)

    await expect(loadConfig()).rejects.toThrow('Duplicate agent name "developer"')
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
