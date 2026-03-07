import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../src/config-loader'

const originalCwd = process.cwd()
const originalConfigPath = process.env.PARALLAX_CONFIG_PATH

afterEach(async () => {
  process.chdir(originalCwd)
  if (originalConfigPath === undefined) {
    delete process.env.PARALLAX_CONFIG_PATH
  } else {
    process.env.PARALLAX_CONFIG_PATH = originalConfigPath
  }
})

describe('config-loader', () => {
  it('loads a strict valid config', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    await fs.mkdir(workspace, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        'concurrency: 2',
        'logs: [info, warn, error]',
        'projects:',
        '  - id: test',
        `    workspaceDir: ${workspace}`,
        '    pullFrom:',
        '      provider: github',
        '      filters:',
        '        owner: org',
        '        repo: repo',
        '    agent:',
        '      provider: codex',
      ].join('\n')
    )

    process.env.PARALLAX_CONFIG_PATH = configPath
    process.chdir(root)

    const config = await loadConfig()
    expect(config.projects).toHaveLength(1)
    expect(config.concurrency).toBe(2)
    expect(config.server.apiPort).toBe(3000)
    expect(config.server.uiPort).toBe(8080)
    expect(config.projects[0].id).toBe('test')
  })

  it('loads configured server ports', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    await fs.mkdir(workspace, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        'server:',
        '  apiPort: 4100',
        '  uiPort: 4101',
        'projects:',
        '  - id: test',
        `    workspaceDir: ${workspace}`,
        '    pullFrom:',
        '      provider: github',
        '      filters:',
        '        owner: org',
        '        repo: repo',
        '    agent:',
        '      provider: codex',
      ].join('\n')
    )

    process.env.PARALLAX_CONFIG_PATH = configPath
    process.chdir(root)

    const config = await loadConfig()
    expect(config.server).toEqual({ apiPort: 4100, uiPort: 4101 })
  })

  it('rejects unsupported agent provider', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-config-'))
    const workspace = path.join(root, 'workspace')
    const configPath = path.join(root, 'parallax.yml')
    await fs.mkdir(workspace, { recursive: true })
    await fs.writeFile(
      configPath,
      [
        'projects:',
        '  - id: test',
        `    workspaceDir: ${workspace}`,
        '    pullFrom:',
        '      provider: github',
        '      filters:',
        '        owner: org',
        '        repo: repo',
        '    agent:',
        '      provider: claude-code',
      ].join('\n')
    )

    process.env.PARALLAX_CONFIG_PATH = configPath
    process.chdir(root)

    await expect(loadConfig()).rejects.toThrow('Unsupported agent provider "claude-code"')
  })
})
