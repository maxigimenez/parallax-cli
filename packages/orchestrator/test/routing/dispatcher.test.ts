import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMMENT_TARGET,
  RUN_STATUS,
  TICKET_PROVIDER,
  TRIGGER_TYPE,
  type AgentDescriptor,
  type Logger,
  type RoutingRule,
  type TriggerEvent,
} from '@parallax/common'
import { openDatabase, type ParallaxDatabase } from '../../src/database.js'
import { HermesClient } from '../../src/hermes/client.js'
import { HermesAdapter } from '../../src/hermes/adapter.js'
import { Dispatcher, type OutcomeHandlers } from '../../src/routing/dispatcher.js'
import { RunLifecycle } from '../../src/routing/run-lifecycle.js'
import { startFakeHermes, type FakeHermes } from '../hermes/fake-hermes-server.js'

let db: ParallaxDatabase
let server: FakeHermes | undefined
let warnings: string[]

const logger: Logger = {
  info: () => undefined,
  success: () => undefined,
  warn: (msg) => warnings.push(msg),
  error: (msg) => warnings.push(msg),
  event: () => undefined,
}

beforeEach(() => {
  db = openDatabase('memory')
  warnings = []
})

afterEach(async () => {
  await server?.close()
  server = undefined
})

function agent(overrides: Partial<AgentDescriptor> = {}): AgentDescriptor {
  return {
    profile: 'product',
    toolsets: [],
    skills: [],
    enabled: true,
    discoveredAt: 0,
    ...overrides,
  }
}

function route(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 'rt_1',
    name: 'Product review',
    priority: 10,
    enabled: true,
    trigger: { type: TRIGGER_TYPE.TICKET, provider: TICKET_PROVIDER.LINEAR, projectId: 'taplands' },
    match: {},
    target: { agentRef: { profile: 'product' } },
    execution: { promptTemplate: 'product-review', requireApproval: false, timeoutSeconds: 30 },
    outcome: { postComment: { target: COMMENT_TARGET.TICKET } },
    ...overrides,
  }
}

function event(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    type: TRIGGER_TYPE.TICKET,
    projectId: 'taplands',
    provider: TICKET_PROVIDER.LINEAR,
    ref: 'LIN-123',
    revision: 'rev-1',
    title: 'Add billing export',
    body: 'We need CSV.',
    labels: ['feasibility'],
    ...overrides,
  }
}

function makeOutcomes(): OutcomeHandlers & {
  comments: Array<{ target: string; body: string }>
  labelCalls: unknown[]
} {
  const comments: Array<{ target: string; body: string }> = []
  const labelCalls: unknown[] = []
  return {
    comments,
    labelCalls,
    postComment: async (target, _event, body) => {
      comments.push({ target, body })
    },
    updateLabels: async (_event, labels) => {
      labelCalls.push(labels)
    },
  }
}

async function makeDispatcher(
  fake: FakeHermes,
  options: {
    agents?: AgentDescriptor[]
    outcomes?: OutcomeHandlers
    ids?: string[]
  } = {}
) {
  const client = new HermesClient({ baseUrl: fake.baseUrl, profile: 'product', apiKey: 'k' })
  const adapter = new HermesAdapter(client, logger, { pollIntervalMs: 5 })
  const ids = options.ids ?? ['pxr_1', 'pxr_2', 'pxr_3']
  let index = 0

  return new Dispatcher({
    db,
    logger,
    lifecycle: new RunLifecycle(db, logger),
    outcomes: options.outcomes ?? makeOutcomes(),
    adapters: new Map([['product', adapter]]),
    agents: options.agents ?? [agent()],
    newRunId: () => ids[index++] ?? `pxr_${index}`,
  })
}

describe('Dispatcher.dispatch', () => {
  it('runs a matching route and records a completed run', async () => {
    server = await startFakeHermes({
      statuses: ['completed'],
      output: 'PARALLAX_SUMMARY: Worth doing, two weeks.',
    })
    const outcomes = makeOutcomes()
    const dispatcher = await makeDispatcher(server, { outcomes })

    const result = await dispatcher.dispatch(event(), [route()])

    expect(result).toEqual({
      outcome: 'dispatched',
      runId: 'pxr_1',
      status: RUN_STATUS.COMPLETED,
    })
    const stored = db.getRun('pxr_1')
    expect(stored).toMatchObject({
      status: RUN_STATUS.COMPLETED,
      agentProfile: 'product',
      triggerRef: 'LIN-123',
      summary: 'Worth doing, two weeks.',
    })
    expect(stored?.endedAt).toBeGreaterThan(0)
  })

  it('posts the agent summary to the tracker', async () => {
    server = await startFakeHermes({
      statuses: ['completed'],
      output: 'PARALLAX_SUMMARY: Feasible.',
    })
    const outcomes = makeOutcomes()

    await (await makeDispatcher(server, { outcomes })).dispatch(event(), [route()])

    expect(outcomes.comments).toEqual([{ target: COMMENT_TARGET.TICKET, body: 'Feasible.' }])
  })

  it('applies label outcomes', async () => {
    server = await startFakeHermes({ statuses: ['completed'] })
    const outcomes = makeOutcomes()
    const withLabels = route({
      outcome: { labels: { add: ['reviewed'], remove: ['feasibility'] } },
    })

    await (await makeDispatcher(server, { outcomes })).dispatch(event(), [withLabels])

    expect(outcomes.labelCalls).toEqual([{ add: ['reviewed'], remove: ['feasibility'] }])
  })

  it('skips when nothing matches, without creating a run', async () => {
    server = await startFakeHermes({})
    const dispatcher = await makeDispatcher(server)

    const result = await dispatcher.dispatch(event({ labels: [] }), [
      route({ match: { labels: { any: ['other'] } } }),
    ])

    expect(result).toEqual({ outcome: 'skipped', reason: 'no-route' })
    expect(db.listRuns()).toHaveLength(0)
  })

  it('fires once for an unchanged trigger and again when it changes', async () => {
    server = await startFakeHermes({ statuses: ['completed'] })
    const dispatcher = await makeDispatcher(server)

    const first = await dispatcher.dispatch(event(), [route()])
    const second = await dispatcher.dispatch(event(), [route()])
    const third = await dispatcher.dispatch(event({ revision: 'rev-2' }), [route()])

    expect(first.outcome).toBe('dispatched')
    expect(second).toEqual({ outcome: 'skipped', reason: 'duplicate' })
    expect(third.outcome).toBe('dispatched')
    expect(db.listRuns()).toHaveLength(2)
  })

  it('defers rather than running two agents against one profile', async () => {
    server = await startFakeHermes({ statuses: ['completed'] })
    const dispatcher = await makeDispatcher(server)

    // An in-flight run occupies the profile.
    db.createRun({
      id: 'existing',
      routeId: 'rt_other',
      routeName: 'other',
      agentProfile: 'product',
      projectId: 'taplands',
      triggerType: TRIGGER_TYPE.TICKET,
      triggerRef: 'LIN-999',
      triggerRevision: 'r',
      title: 't',
      status: RUN_STATUS.RUNNING,
      createdAt: 1,
      updatedAt: 1,
    })

    const result = await dispatcher.dispatch(event(), [route()])

    expect(result.outcome).toBe('skipped')
    expect(result).toMatchObject({ reason: 'agent-busy' })
  })

  it('leaves the trigger unclaimed when deferring, so it runs next cycle', async () => {
    server = await startFakeHermes({ statuses: ['completed'] })
    const dispatcher = await makeDispatcher(server)

    db.createRun({
      id: 'existing',
      routeId: 'rt_other',
      routeName: 'other',
      agentProfile: 'product',
      projectId: 'taplands',
      triggerType: TRIGGER_TYPE.TICKET,
      triggerRef: 'LIN-999',
      triggerRevision: 'r',
      title: 't',
      status: RUN_STATUS.RUNNING,
      createdAt: 1,
      updatedAt: 1,
    })
    await dispatcher.dispatch(event(), [route()])

    // The blocking run finishes; the same trigger must now be dispatchable.
    db.updateRun('existing', { status: RUN_STATUS.COMPLETED })
    const retry = await dispatcher.dispatch(event(), [route()])

    expect(retry.outcome).toBe('dispatched')
  })

  it('skips a route pointing at an agent that is not registered', async () => {
    server = await startFakeHermes({})
    const dispatcher = await makeDispatcher(server, { agents: [agent({ profile: 'coder' })] })

    const result = await dispatcher.dispatch(event(), [route()])

    expect(result).toMatchObject({ outcome: 'skipped', reason: 'unknown-agent' })
    expect(warnings.join(' ')).toContain('not a known enabled agent')
  })

  it('skips a route pointing at a disabled agent', async () => {
    server = await startFakeHermes({})
    const dispatcher = await makeDispatcher(server, { agents: [agent({ enabled: false })] })

    const result = await dispatcher.dispatch(event(), [route()])
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'unknown-agent' })
  })

  it('resolves an agent by github login for reviewer-assignment routes', async () => {
    server = await startFakeHermes({ statuses: ['completed'] })
    const dispatcher = await makeDispatcher(server, {
      agents: [agent({ githubLogin: 'Acme-Bot' })],
    })

    const result = await dispatcher.dispatch(
      event({
        type: TRIGGER_TYPE.PR_REVIEW_REQUESTED,
        provider: TICKET_PROVIDER.GITHUB,
        requestedReviewers: ['acme-bot'],
      }),
      [
        route({
          trigger: { type: TRIGGER_TYPE.PR_REVIEW_REQUESTED, projectId: 'taplands' },
          target: { agentRef: { githubLogin: 'acme-bot' } },
          execution: { promptTemplate: 'pr-review', requireApproval: false, timeoutSeconds: 30 },
        }),
      ]
    )

    expect(result.outcome).toBe('dispatched')
  })

  it('releases the claim on a bad prompt template so a fix can run', async () => {
    server = await startFakeHermes({})
    const dispatcher = await makeDispatcher(server)
    const broken = route({
      execution: { promptTemplate: 'does-not-exist', requireApproval: false, timeoutSeconds: 30 },
    })

    const result = await dispatcher.dispatch(event(), [broken])

    expect(result).toMatchObject({ outcome: 'failed' })
    expect(db.listRuns()).toHaveLength(0)

    // Same route id, same trigger: because the claim was released, correcting
    // the template lets it run rather than being suppressed as a duplicate.
    const fixed = await dispatcher.dispatch(event(), [route()])
    expect(fixed.outcome).toBe('dispatched')

    // And it is claimed now, so it does not run twice.
    expect((await dispatcher.dispatch(event(), [route()])).outcome).toBe('skipped')
  })

  it('records a failed run and tells the tracker about it', async () => {
    server = await startFakeHermes({ statuses: ['failed'], runError: 'tool crashed' })
    const outcomes = makeOutcomes()

    const result = await (await makeDispatcher(server, { outcomes })).dispatch(event(), [route()])

    expect(result).toMatchObject({ outcome: 'dispatched', status: RUN_STATUS.FAILED })
    expect(db.getRun('pxr_1')).toMatchObject({ status: RUN_STATUS.FAILED, error: 'tool crashed' })
    expect(outcomes.comments[0].body).toContain('Parallax run failed: tool crashed')
  })

  it('does not fail a good run because an outcome handler threw', async () => {
    server = await startFakeHermes({
      statuses: ['completed'],
      output: 'PARALLAX_SUMMARY: fine',
    })
    const outcomes = makeOutcomes()
    outcomes.postComment = vi.fn().mockRejectedValue(new Error('linear is down'))

    const result = await (await makeDispatcher(server, { outcomes })).dispatch(event(), [route()])

    expect(result).toMatchObject({ status: RUN_STATUS.COMPLETED })
    expect(db.getRun('pxr_1')?.status).toBe(RUN_STATUS.COMPLETED)
    expect(warnings.join(' ')).toContain('linear is down')
  })

  it('records a pending approval without posting an outcome', async () => {
    server = await startFakeHermes({ statuses: ['pending_approval'] })
    const outcomes = makeOutcomes()

    const result = await (await makeDispatcher(server, { outcomes })).dispatch(event(), [route()])

    expect(result).toMatchObject({ status: RUN_STATUS.AWAITING_APPROVAL })
    expect(outcomes.comments).toEqual([])
    expect(db.countActiveRunsForAgent('product')).toBe(1)
  })
})

describe('cancellation wiring', () => {
  it('persists the hermes run id before the run finishes, so a cancel can reach it', async () => {
    server = await startFakeHermes({ statuses: ['running'] })
    const inFlight = new Map<string, AbortController>()
    const client = new HermesClient({ baseUrl: server.baseUrl, profile: 'product', apiKey: 'k' })
    const adapter = new HermesAdapter(client, logger, { pollIntervalMs: 20 })

    const dispatcher = new Dispatcher({
      db,
      logger,
      lifecycle: new RunLifecycle(db, logger),
      outcomes: makeOutcomes(),
      adapters: new Map([['product', adapter]]),
      agents: [agent()],
      newRunId: () => 'pxr_1',
      inFlight,
    })

    const pending = dispatcher.dispatch(event(), [route()])

    // Mid-run: the row already knows which Hermes run to stop, and the
    // controller is registered for a local abort.
    await vi.waitFor(() => {
      expect(db.getRun('pxr_1')?.hermesRunId).toBe('run_test_1')
      expect(inFlight.has('pxr_1')).toBe(true)
    })

    inFlight.get('pxr_1')!.abort()
    await pending

    // And the registry is cleaned up once the run settles.
    expect(inFlight.has('pxr_1')).toBe(false)
  })

  it('aborting the registered controller stops the run on the Hermes side', async () => {
    server = await startFakeHermes({ statuses: ['running'] })
    const inFlight = new Map<string, AbortController>()
    const client = new HermesClient({ baseUrl: server.baseUrl, profile: 'product', apiKey: 'k' })
    const adapter = new HermesAdapter(client, logger, { pollIntervalMs: 10 })

    const dispatcher = new Dispatcher({
      db,
      logger,
      lifecycle: new RunLifecycle(db, logger),
      outcomes: makeOutcomes(),
      adapters: new Map([['product', adapter]]),
      agents: [agent()],
      newRunId: () => 'pxr_1',
      inFlight,
    })

    const pending = dispatcher.dispatch(event(), [route()])

    // Wait until Hermes has acknowledged the run, so this exercises the normal
    // "cancel something that is genuinely running" path.
    await vi.waitFor(() => expect(db.getRun('pxr_1')?.hermesRunId).toBe('run_test_1'))
    inFlight.get('pxr_1')!.abort()

    const result = await pending

    expect(result).toMatchObject({ status: RUN_STATUS.CANCELED })
    expect(server!.stopCalls).toEqual(['run_test_1'])
    expect(db.getRun('pxr_1')?.status).toBe(RUN_STATUS.CANCELED)
  })

  it('reports a possible orphan when aborted before Hermes acknowledged the run', async () => {
    server = await startFakeHermes({ statuses: ['running'] })
    const inFlight = new Map<string, AbortController>()
    const client = new HermesClient({ baseUrl: server.baseUrl, profile: 'product', apiKey: 'k' })
    const adapter = new HermesAdapter(client, logger, { pollIntervalMs: 10 })

    const dispatcher = new Dispatcher({
      db,
      logger,
      lifecycle: new RunLifecycle(db, logger),
      outcomes: makeOutcomes(),
      adapters: new Map([['product', adapter]]),
      agents: [agent()],
      newRunId: () => 'pxr_1',
      inFlight,
    })

    const pending = dispatcher.dispatch(event(), [route()])
    // Abort in the window before Hermes has answered POST /v1/runs at all.
    await vi.waitFor(() => expect(inFlight.has('pxr_1')).toBe(true))
    inFlight.get('pxr_1')!.abort()

    const result = await pending

    expect(result).toMatchObject({ status: RUN_STATUS.CANCELED })
    // Nothing identifies the run, so we say so rather than pretending it stopped.
    expect(warnings.join(' ')).toContain('may be orphaned')
  })
})

describe('routing decisions are reported before the run', () => {
  it('reports every skip reason, including the silent ones', async () => {
    server = await startFakeHermes({ statuses: ['completed'] })
    const dispatcher = await makeDispatcher(server)
    const seen: string[] = []
    const record = (d: { outcome: string; reason?: string }) => seen.push(d.reason ?? d.outcome)

    // no-route: the case that used to produce no output at all.
    await dispatcher.dispatch(
      event({ labels: [] }),
      [route({ match: { labels: { any: ['nope'] } } })],
      record
    )

    await dispatcher.dispatch(event(), [route()], record) // started
    await dispatcher.dispatch(event(), [route()], record) // duplicate

    expect(seen).toEqual(['no-route', 'started', 'duplicate'])
  })

  it('reports the decision before the agent run finishes', async () => {
    server = await startFakeHermes({ statuses: ['running'] })
    const inFlight = new Map<string, AbortController>()
    const client = new HermesClient({ baseUrl: server.baseUrl, profile: 'product', apiKey: 'k' })
    const adapter = new HermesAdapter(client, logger, { pollIntervalMs: 10 })

    const dispatcher = new Dispatcher({
      db,
      logger,
      lifecycle: new RunLifecycle(db, logger),
      outcomes: makeOutcomes(),
      adapters: new Map([['product', adapter]]),
      agents: [agent()],
      newRunId: () => 'pxr_1',
      inFlight,
    })

    const decisions: string[] = []
    const pending = dispatcher.dispatch(event(), [route()], (d) => decisions.push(d.outcome))

    // The run is still going, but routing has already been reported -- which is
    // what lets a per-cycle summary count it without waiting half an hour.
    await vi.waitFor(() => expect(decisions).toEqual(['started']))

    inFlight.get('pxr_1')!.abort()
    await pending
  })
})
