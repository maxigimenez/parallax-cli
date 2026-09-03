import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_LOG_KIND, RUN_LOG_LEVEL, RUN_LOG_SOURCE } from '@parallax/common'
import { openDatabase, type ParallaxDatabase } from '../src/database.js'
import { logger, setLoggerDatabase } from '../src/logger.js'

/** An ISO-8601 instant in UTC, anywhere in the line. */
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/

let db: ParallaxDatabase
let out: string[]
let err: string[]

beforeEach(() => {
  db = openDatabase('memory')
  setLoggerDatabase(db)
  out = []
  err = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line))
  vi.spyOn(console, 'error').mockImplementation((line: string) => void err.push(line))
})

afterEach(() => {
  vi.restoreAllMocks()
  setLoggerDatabase(undefined)
})

/**
 * The runner's own log is read out of `runner.stdout.log` long after the fact,
 * usually to answer "when did this start failing". Without a time on the line
 * that question has no answer at all.
 */
describe('runner log timestamps', () => {
  it('stamps every level with an ISO-8601 instant', () => {
    logger.info('watching 2 projects')
    logger.success('registered with the cloud')
    logger.warn('cloud mirror deferred')
    logger.error('dispatch failed')

    expect(out).toHaveLength(3)
    expect(err).toHaveLength(1)
    for (const line of [...out, ...err]) {
      expect(line).toMatch(ISO)
    }
  })

  it('leads the line with the time, so the left edge sorts', () => {
    logger.info('watching 2 projects')
    // Chalk may or may not colour, depending on whether the test runner is a
    // TTY, so the escape codes are stripped before the position is asserted.
    // eslint-disable-next-line no-control-regex
    const plain = out[0].replace(/\[[0-9;]*m/g, '')
    expect(plain.indexOf(plain.match(ISO)![0])).toBe(0)
  })

  it('reports when a run event was recorded, not when it was printed', () => {
    const runId = 'pxr_1'
    db.createRun({
      id: runId,
      routeId: 'rt_1',
      routeName: 'Assess',
      agentProfile: 'product',
      projectId: 'acme/platform',
      triggerType: 'ticket',
      triggerRef: 'LIN-1',
      triggerRevision: 'r',
      title: 'Billing export',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    logger.event({
      runId,
      message: 'Hermes refused the run',
      level: RUN_LOG_LEVEL.ERROR,
      kind: RUN_LOG_KIND.LIFECYCLE,
      source: RUN_LOG_SOURCE.SYSTEM,
    })

    // The stored event and the console line must name the same instant: they
    // are the two records of the same error, and a reader lines them up.
    const [stored] = db.listRunEvents(runId, { limit: 10 })
    expect(err[0]).toContain(new Date(stored.timestamp).toISOString())
  })
})
