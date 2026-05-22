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

function makeStoredConfig(overrides: object = {}) {
  return JSON.stringify(
    {
      version: 1,
      projects: [],
      agents: [],
      slack: null,
      secrets: {},
      updatedAt: Date.now(),
      ...overrides,
    },
    null,
    2
  )
}

async function setupDataDir(root: string) {
  const dataDir = path.join(root, '.parallax')
  await fs.mkdir(dataDir, { recursive: true })
  process.env.PARALLAX_DATA_DIR = dataDir
  return dataDir
}

describe('config-loader', () => {
  it('returns empty config when config.json is missing', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    process.env.PARALLAX_DATA_DIR = dataDir

    const config = await loadConfig()
    expect(config.projects).toHaveLength(0)
    expect(config.server.apiPort).toBe(3000)
    expect(config.server.uiPort).toBe(8080)
    expect(config.concurrency).toBe(2)
  })

  it('loads a valid config from config.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'codex' },
          },
        ],
      })
    )

    process.env.PARALLAX_CONCURRENCY = '4'
    process.env.PARALLAX_SERVER_API_PORT = '4100'
    process.env.PARALLAX_SERVER_UI_PORT = '4101'

    const config = await loadConfig()
    expect(config.projects).toHaveLength(1)
    expect(config.projects[0].id).toBe('test')
    expect(config.concurrency).toBe(4)
    expect(config.server.apiPort).toBe(4100)
    expect(config.server.uiPort).toBe(4101)
  })

  it('accepts claude-code as a supported agent provider', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'claude-code' },
          },
        ],
      })
    )

    const config = await loadConfig()
    expect(config.projects[0].agent.provider).toBe('claude-code')
  })

  it('rejects unsupported agent provider', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'unknown-agent' },
          },
        ],
      })
    )

    await expect(loadConfig()).rejects.toThrow('Unsupported agent provider "unknown-agent"')
  })

  it('loads named agents from agents array', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        agents: [
          {
            name: 'developer',
            provider: 'claude-code',
            model: 'claude-opus-4-5',
            systemPrompt: 'You are a senior engineer.',
          },
        ],
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { name: 'developer' },
          },
        ],
      })
    )

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

  it('loads agentLabels mapping on a project', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        agents: [
          { name: 'developer', provider: 'codex' },
          { name: 'reviewer', provider: 'gemini' },
        ],
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { name: 'developer' },
            agentLabels: { 'ai-frontend': 'reviewer', 'ai-security': 'reviewer' },
          },
        ],
      })
    )

    const config = await loadConfig()
    expect(config.projects[0].agentLabels).toEqual({
      'ai-frontend': 'reviewer',
      'ai-security': 'reviewer',
    })
  })

  it('rejects agentLabels value referencing an unknown agent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        agents: [{ name: 'developer', provider: 'codex' }],
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { name: 'developer' },
            agentLabels: { 'ai-frontend': 'does-not-exist' },
          },
        ],
      })
    )

    await expect(loadConfig()).rejects.toThrow('unknown agent "does-not-exist"')
  })

  it('loads slack config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        slack: { botToken: 'xoxb-test-token', appToken: 'xapp-test-token', channel: '#ai-tasks' },
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'codex' },
          },
        ],
      })
    )

    const config = await loadConfig()
    expect(config.slack).toEqual({
      botToken: 'xoxb-test-token',
      appToken: 'xapp-test-token',
      channel: '#ai-tasks',
    })
  })

  it('rejects slack botToken not starting with xoxb-', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        slack: { botToken: 'bad-token', appToken: 'xapp-test-token', channel: '#ai-tasks' },
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'codex' },
          },
        ],
      })
    )

    await expect(loadConfig()).rejects.toThrow('xoxb-')
  })

  it('rejects duplicate project ids', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    const project = {
      id: 'test',
      workspaceDir: workspace,
      pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
      agent: { provider: 'codex' },
    }

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({ projects: [project, project] })
    )

    await expect(loadConfig()).rejects.toThrow('Duplicate project id "test"')
  })

  it('rejects duplicate agent names', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    const agent = { name: 'developer', provider: 'codex' }

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        agents: [agent, agent],
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'codex' },
          },
        ],
      })
    )

    await expect(loadConfig()).rejects.toThrow('Duplicate agent name "developer"')
  })

  it('injects secrets into process.env without overwriting existing values', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    await fs.mkdir(workspace, { recursive: true })
    const dataDir = await setupDataDir(root)

    process.env.EXISTING_KEY = 'existing'
    delete process.env.NEW_KEY

    await fs.writeFile(
      path.join(dataDir, 'config.json'),
      makeStoredConfig({
        secrets: { EXISTING_KEY: 'should-not-overwrite', NEW_KEY: 'injected' },
        projects: [
          {
            id: 'test',
            workspaceDir: workspace,
            pullFrom: { provider: 'github', filters: { owner: 'org', repo: 'repo' } },
            agent: { provider: 'codex' },
          },
        ],
      })
    )

    await loadConfig()
    expect(process.env.EXISTING_KEY).toBe('existing')
    expect(process.env.NEW_KEY).toBe('injected')

    delete process.env.EXISTING_KEY
    delete process.env.NEW_KEY
  })

  it('returns empty config when config.json is empty object', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const dataDir = await setupDataDir(root)

    await fs.writeFile(path.join(dataDir, 'config.json'), '{}')

    const config = await loadConfig()
    expect(config.projects).toHaveLength(0)
    expect(config.agents).toHaveLength(0)
    expect(config.slack).toBeUndefined()
  })
})
