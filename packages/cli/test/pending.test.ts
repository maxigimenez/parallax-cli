import { describe, it, expect } from 'vitest'
import {
  parseConfigProjectIds,
  resolveApproveTargets,
  resolveRejectTarget,
  parseStartOptions,
  parseStopOptions,
  parsePendingOptions,
  parseRetryOptions,
  parseCancelOptions,
  parseStatusOptions,
  parseLogsOptions,
  parsePreflightOptions,
  parseRegisterOptions,
  scopePendingTasks,
} from '../src/index.js'

describe('CLI pending scope and approval helpers', () => {
  it('parses project IDs from valid config YAML', () => {
    const raw = `- id: revora-mvp\n- id: www\n`

    const ids = parseConfigProjectIds(raw, 'parallax.yml')

    expect(ids.has('revora-mvp')).toBe(true)
    expect(ids.has('www')).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('throws for malformed config YAML', () => {
    const raw = `projects: [1,2,3]`

    expect(() => parseConfigProjectIds(raw, 'parallax.yml')).toThrow('Invalid parallax config')
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

    expect(() => resolveApproveTargets(tasks, 'unknown')).toThrow('Unknown task id: unknown')
  })

  it('resolves a single explicit approval target', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }] as any[]

    expect(resolveApproveTargets(tasks, 'a')).toEqual(['a'])
  })

  it('rejects multiple approval targets', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }] as any[]

    expect(() => resolveApproveTargets(tasks, 'a,b')).toThrow('Approve accepts a single task id.')
  })

  it('rejects unknown task id on reject action', () => {
    const tasks = [{ id: 'a' }] as any[]

    expect(() => resolveRejectTarget(tasks, 'nope')).toThrow('Unknown task id: nope')
  })

  it('throws when config has no projects section', () => {
    const raw = `concurrency: 1\n`

    expect(() => parseConfigProjectIds(raw, 'parallax.yml')).toThrow('Invalid parallax config')
  })

  it('parses start options with defaults', () => {
    const options = parseStartOptions([])
    expect(options.apiPort).toBe(3000)
    expect(options.uiPort).toBe(8080)
    expect(options.concurrency).toBe(2)
  })

  it('throws on approve without a value', () => {
    expect(() => parsePendingOptions(['--approve'])).toThrow('Missing value for --approve.')
  })

  it('throws when both approve and reject are used together', () => {
    expect(() => parsePendingOptions(['--approve', 'abc-123', '--reject', 'xyz-456'])).toThrow(
      'Use either --approve or --reject, not both.'
    )
  })

  it('parses strict pending options when valid', () => {
    const options = parsePendingOptions(['--approve', 'abc-123'])

    expect(options.approve).toBe('abc-123')
  })

  it('parses stop options with defaults', () => {
    const options = parseStopOptions([])
    expect(options).toEqual({})
  })

  it('rejects stop flags', () => {
    expect(() => parseStopOptions(['--force'])).toThrow('parallax stop does not accept flags.')
  })

  it('parses retry options with default mode', () => {
    const options = parseRetryOptions(['eng-123'])
    expect(options.taskId).toBe('eng-123')
  })

  it('rejects retry flags', () => {
    expect(() => parseRetryOptions(['eng-123', '--mode', 'execution'])).toThrow(
      'parallax retry does not accept flags.'
    )
  })

  it('parses cancel options', () => {
    const options = parseCancelOptions(['eng-123'])
    expect(options.taskId).toBe('eng-123')
  })

  it('parses logs options with task', () => {
    const options = parseLogsOptions(['--task', 'eng-123'])
    expect(options.taskId).toBe('eng-123')
  })

  it('rejects unsupported logs flags', () => {
    expect(() => parseLogsOptions(['--since', '-1'])).toThrow(
      'parallax logs only accepts optional --task <task-id>.'
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

  it('parses status options with defaults', () => {
    const options = parseStatusOptions([])
    expect(options).toEqual({})
  })

  it('rejects status flags', () => {
    expect(() => parseStatusOptions(['--verbose'])).toThrow(
      'parallax status does not accept flags.'
    )
  })

  it('parses register options', () => {
    const options = parseRegisterOptions(['./config.yml'], 'register')
    expect(options.configPath).toBe('./config.yml')
  })

  it('parses register env file option', () => {
    const options = parseRegisterOptions(['./config.yml', '--env-file', './.env'], 'register')
    expect(options.envFilePath).toBe('./.env')
  })
})
