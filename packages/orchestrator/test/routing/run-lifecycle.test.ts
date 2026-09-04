import { beforeEach, describe, expect, it } from 'vitest'
import { RUN_STATUS, TRIGGER_TYPE, type Logger, type RunRecord } from '@sentinel0/common'
import { openDatabase, type Sentinel0Database } from '../../src/database.js'
import { RunLifecycle } from '../../src/routing/run-lifecycle.js'

let db: Sentinel0Database

const logger: Logger = {
  info: () => undefined,
  success: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  event: () => undefined,
}

beforeEach(() => {
  db = openDatabase('memory')
})

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'pxr_1',
    routeId: 'rt_1',
    routeName: 'Product review',
    agentProfile: 'product',
    projectId: 'taplands',
    triggerType: TRIGGER_TYPE.TICKET,
    triggerRef: 'LIN-123',
    triggerRevision: 'r',
    title: 'Billing export',
    status: RUN_STATUS.QUEUED,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function observed() {
  const created: string[] = []
  const changed: string[] = []
  const settled: string[] = []
  return {
    created,
    changed,
    settled,
    observer: {
      created: (r: RunRecord) => created.push(r.status),
      changed: (r: RunRecord) => changed.push(r.status),
      settled: (r: RunRecord) => settled.push(r.status),
    },
  }
}

describe('RunLifecycle observation', () => {
  it('reports creation exactly once, separately from later changes', () => {
    const o = observed()
    const lifecycle = new RunLifecycle(db, logger, o.observer)

    lifecycle.created(run())

    expect(o.created).toEqual([RUN_STATUS.QUEUED])
    expect(o.changed).toEqual([])
    expect(db.getRun('pxr_1')).toBeDefined()
  })

  it('reports every status transition', () => {
    const o = observed()
    const lifecycle = new RunLifecycle(db, logger, o.observer)

    lifecycle.created(run())
    lifecycle.running('pxr_1')
    lifecycle.completed('pxr_1', 'done')

    expect(o.changed).toEqual([RUN_STATUS.RUNNING, RUN_STATUS.COMPLETED])
  })

  it('reports settled only for terminal statuses', () => {
    const o = observed()
    const lifecycle = new RunLifecycle(db, logger, o.observer)

    lifecycle.created(run())
    lifecycle.running('pxr_1')
    lifecycle.awaitingApproval('pxr_1')
    expect(o.settled).toEqual([])

    lifecycle.failed('pxr_1', 'boom')
    expect(o.settled).toEqual([RUN_STATUS.FAILED])
  })

  it('passes the stored record, not the caller argument', () => {
    const seen: RunRecord[] = []
    const lifecycle = new RunLifecycle(db, logger, { changed: (r) => seen.push(r) })

    lifecycle.created(run())
    lifecycle.completed('pxr_1', 'the summary')

    // The summary and endedAt only exist after the write, so a mirror built
    // from the caller's argument would ship a stale record.
    expect(seen.at(-1)?.summary).toBe('the summary')
    expect(seen.at(-1)?.endedAt).toBeGreaterThan(0)
  })

  it('reports the hermes id being attached, so a cancel target is mirrored', () => {
    const o = observed()
    const lifecycle = new RunLifecycle(db, logger, o.observer)

    lifecycle.created(run())
    lifecycle.attachHermesRun('pxr_1', 'run_abc')

    expect(o.changed).toHaveLength(1)
    expect(db.getRun('pxr_1')?.hermesRunId).toBe('run_abc')
  })

  it('works with no observer at all', () => {
    const lifecycle = new RunLifecycle(db, logger)
    expect(() => {
      lifecycle.created(run())
      lifecycle.completed('pxr_1')
    }).not.toThrow()
  })

  it('ignores a transition for a run that does not exist', () => {
    const o = observed()
    const lifecycle = new RunLifecycle(db, logger, o.observer)

    lifecycle.completed('missing')

    expect(o.changed).toEqual([])
    expect(o.settled).toEqual([])
  })
})
