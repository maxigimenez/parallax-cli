import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseConfigProjectIds,
  resolveApproveTargets,
  resolveRejectTarget,
  parseStopOptions,
  parsePendingOptions,
  parseRetryOptions,
  parseCancelOptions,
  parseLogsOptions,
  parsePreflightOptions,
  scopePendingTasks,
  resolveProjectIdsForPending,
} from '../src/index.js'

describe('CLI pending scope and approval helpers', () => {
  it('parses project IDs from valid config YAML', () => {
    const raw = `projects:\n  - id: revora-mvp\n  - id: www\n`

    const ids = parseConfigProjectIds(raw, 'parallax.yml')

    expect(ids.has('revora-mvp')).toBe(true)
    expect(ids.has('www')).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('throws for malformed config YAML', () => {
    const raw = `projects: [1,2,3]`

    expect(() => parseConfigProjectIds(raw, 'parallax.yml')).toThrow('Invalid item')
  })

  it('filters pending tasks by configured project IDs', () => {
    const tasks = [
      { id: 'a', projectId: 'revora-mvp' },
      { id: 'b', projectId: 'www' },
      { id: 'c', projectId: 'api' },
    ] as any[]

    const scoped = scopePendingTasks(tasks, new Set(['revora-mvp', 'www']))

    expect(scoped.map((task) => task.id)).toEqual(['a', 'b'])
  })

  it('throws when scoped tasks include tasks without projectId', () => {
    const tasks = [{ id: 'a' }] as any[]

    expect(() => scopePendingTasks(tasks, new Set(['revora-mvp']))).toThrow(
      'Pending task a has no projectId. Cannot apply project-level scope.'
    )
  })

  it('rejects approvals for unknown task ids', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }] as any[]

    expect(() => resolveApproveTargets(tasks, 'unknown')).toThrow('Unknown task id(s): unknown')
  })

  it('resolves explicit approval targets and all', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }] as any[]

    expect(resolveApproveTargets(tasks, 'a,b').sort()).toEqual(['a', 'b'])
    expect(new Set(resolveApproveTargets(tasks, 'all'))).toEqual(new Set(['a', 'b']))
  })

  it('rejects unknown task id on reject action', () => {
    const tasks = [{ id: 'a' }] as any[]

    expect(() => resolveRejectTarget(tasks, 'nope')).toThrow('Unknown task id: nope')
  })

  it('throws when config has no projects section', () => {
    const raw = `concurrency: 1\n`

    expect(() => parseConfigProjectIds(raw, 'parallax.yml')).toThrow('Invalid parallax config')
  })

  it('throws on approve without a value', () => {
    expect(() => parsePendingOptions(['--approve'])).toThrow('Missing value for --approve.')
  })

  it('throws on reject without a reason', () => {
    expect(() => parsePendingOptions(['--reject', 'abc-123'])).toThrow(
      'Reject action requires --reason.'
    )
  })

  it('throws when reason is used without reject', () => {
    expect(() => parsePendingOptions(['--reason', 'only'])).toThrow(
      '--reason can only be used with --reject.'
    )
  })

  it('throws when both approve and reject are used together', () => {
    expect(() =>
      parsePendingOptions(['--approve', 'abc-123', '--reject', 'xyz-456', '--reason', 'bad'])
    ).toThrow('Use either --approve or --reject, not both.')
  })

  it('parses strict pending options when valid', () => {
    const options = parsePendingOptions([
      '--api',
      'http://localhost:4000',
      '--approve',
      'abc-123,abc-456',
      '--approver',
      'qa-bot',
    ])

    expect(options.apiBase).toBe('http://localhost:4000')
    expect(options.approve).toBe('abc-123,abc-456')
    expect(options.approver).toBe('qa-bot')
  })

  it('parses stop options with defaults', () => {
    const options = parseStopOptions([])

    expect(options.dataDir).toBe(process.cwd() + '/.parallax')
    expect(options.force).toBe(false)
  })

  it('parses stop options with custom data dir and force', () => {
    const options = parseStopOptions(['--data-dir', './.parallax', '--force'])

    expect(options.dataDir).toBe(process.cwd() + '/.parallax')
    expect(options.force).toBe(true)
  })

  it('parses retry options with default mode', () => {
    const options = parseRetryOptions(['eng-123'])
    expect(options.taskId).toBe('eng-123')
    expect(options.mode).toBe('full')
    expect(options.apiBase).toBe('http://localhost:3000')
  })

  it('parses retry options with explicit execution mode', () => {
    const options = parseRetryOptions(['eng-123', '--mode', 'execution', '--api', 'http://x'])
    expect(options.taskId).toBe('eng-123')
    expect(options.mode).toBe('execution')
    expect(options.apiBase).toBe('http://x')
  })

  it('throws for invalid retry mode', () => {
    expect(() => parseRetryOptions(['eng-123', '--mode', 'bad'])).toThrow(
      '--mode must be one of: full, execution.'
    )
  })

  it('parses cancel options', () => {
    const options = parseCancelOptions(['eng-123', '--api', 'http://x'])
    expect(options.taskId).toBe('eng-123')
    expect(options.apiBase).toBe('http://x')
  })

  it('parses logs options with task and since', () => {
    const options = parseLogsOptions(['--task', 'eng-123', '--since', '42'])
    expect(options.taskId).toBe('eng-123')
    expect(options.since).toBe(42)
  })

  it('throws for invalid logs since', () => {
    expect(() => parseLogsOptions(['--since', '-1'])).toThrow(
      '--since must be a non-negative integer epoch timestamp.'
    )
  })

  it('parses preflight options with defaults', () => {
    const options = parsePreflightOptions([])
    expect(options).toEqual({})
  })

  it('rejects preflight flags', () => {
    expect(() => parsePreflightOptions(['--config', './parallax.yml'])).toThrow(
      'parallax preflight does not accept flags.'
    )
  })

  it('resolves pending scope from running manifest when no --config is passed', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'parallax-cli-'))
    const configPath = path.join(dir, 'parallax.yml')
    const manifestPath = path.join(dir, 'running.json')

    try {
      await fs.writeFile(configPath, 'projects:\n  - id: from-running\n')
      await fs.writeFile(
        manifestPath,
        JSON.stringify(
          {
            startedAt: Date.now(),
            configPath,
            dataDir: dir,
            orchestratorPid: 1,
            uiPid: 2,
          },
          null,
          2
        )
      )

      const ids = await resolveProjectIdsForPending(dir)

      expect(ids.has('from-running')).toBe(true)
      expect(ids.size).toBe(1)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

})
