import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApiServer } from '../src/runtime/api-server.js'
import type { FastifyInstance } from 'fastify'
import { TASK_STATUS, TaskPlanState } from '@parallax/common'

// ── module mocks ────────────────────────────────────────────────────────────

vi.mock('../src/database.js', () => ({
  dbService: {
    listTasks: vi.fn().mockReturnValue([]),
    getTaskByLookup: vi.fn().mockReturnValue(null),
    listTaskLogs: vi.fn().mockReturnValue([]),
    approveTaskPlan: vi.fn(),
    rejectTaskPlan: vi.fn(),
    updateTaskPlanOutput: vi.fn(),
    updateTaskStatus: vi.fn(),
    clearTaskLogs: vi.fn(),
    clearTaskPullRequestInfo: vi.fn(),
    resetTaskForFullRetry: vi.fn(),
    resetExecutionAttempts: vi.fn(),
  },
}))

vi.mock('../src/logger.js', () => ({ resetTaskRuntimeState: vi.fn() }))
vi.mock('../src/logging/socket-publisher.js', () => ({ emitConfigUpdated: vi.fn() }))
vi.mock('../src/task-lifecycle.js', () => ({
  taskLifecycle: { queue: vi.fn(), fail: vi.fn(), cancel: vi.fn() },
}))
vi.mock('../src/runtime/diagnostics.js', () => ({
  readOrchestratorErrors: vi.fn().mockResolvedValue([]),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

function buildDependencies(overrides: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn().mockReturnValue({ projects: [] }),
    reloadRuntime: vi.fn().mockResolvedValue({ projects: [] }),
    triggerPullRequestReview: vi.fn(),
    gitService: { getWorktreeChangedFiles: vi.fn(), getTaskUnifiedDiff: vi.fn() } as any,
    activeTasks: new Set<string>(),
    canceledTasks: new Set<string>(),
    activeWorktrees: new Map<string, string>(),
    ...overrides,
  }
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    externalId: 'ENG-1',
    title: 'Test task',
    status: TASK_STATUS.PENDING,
    projectId: 'proj-1',
    planState: TaskPlanState.PLAN_APPROVED,
    executionAttempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('createApiServer – CORS', () => {
  let server: FastifyInstance

  beforeEach(async () => {
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => {
    await server.close()
  })

  it('allows requests from localhost origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/tasks',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })

  it('allows requests from 127.0.0.1 origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/tasks',
      headers: { origin: 'http://127.0.0.1:4321' },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4321')
  })

  it('blocks requests from an external origin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/tasks',
      headers: { origin: 'https://evil.example.com' },
    })
    // @fastify/cors returns 400 or omits the header for disallowed origins
    const allowOrigin = res.headers['access-control-allow-origin']
    expect(allowOrigin).not.toBe('https://evil.example.com')
    expect(allowOrigin).not.toBe('*')
  })

  it('does not use wildcard CORS', async () => {
    const res = await server.inject({ method: 'GET', url: '/tasks' })
    expect(res.headers['access-control-allow-origin']).not.toBe('*')
  })
})

describe('GET /tasks', () => {
  let server: FastifyInstance

  beforeEach(async () => {
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => { await server.close() })

  it('returns empty array when no tasks', async () => {
    const res = await server.inject({ method: 'GET', url: '/tasks' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual([])
  })
})

describe('GET /logs', () => {
  let server: FastifyInstance

  beforeEach(async () => {
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => { await server.close() })

  it('returns 200 with default params', async () => {
    const res = await server.inject({ method: 'GET', url: '/logs' })
    expect(res.statusCode).toBe(200)
  })

  it('returns 400 for invalid since param', async () => {
    const res = await server.inject({ method: 'GET', url: '/logs?since=notanumber' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for negative since param', async () => {
    const res = await server.inject({ method: 'GET', url: '/logs?since=-1' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for zero limit', async () => {
    const res = await server.inject({ method: 'GET', url: '/logs?limit=0' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /tasks/:taskId/diff/files', () => {
  let server: FastifyInstance

  beforeEach(async () => {
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => { await server.close() })

  it('returns 404 when task not found', async () => {
    const res = await server.inject({ method: 'GET', url: '/tasks/nonexistent/diff/files' })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /tasks/:taskId/approve', () => {
  let server: FastifyInstance
  let dbService: any

  beforeEach(async () => {
    const mod = await import('../src/database.js')
    dbService = mod.dbService
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => { await server.close() })

  it('returns 404 when task not found', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(null)
    const res = await server.inject({ method: 'POST', url: '/tasks/nonexistent/approve' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 409 when task is not awaiting plan approval', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(
      makeTask({ planState: TaskPlanState.PLAN_APPROVED })
    )
    const res = await server.inject({ method: 'POST', url: '/tasks/task-1/approve' })
    expect(res.statusCode).toBe(409)
  })

  it('returns 400 when planMarkdown is empty', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(
      makeTask({ planState: TaskPlanState.PLAN_READY })
    )
    const res = await server.inject({
      method: 'POST',
      url: '/tasks/task-1/approve',
      payload: { planMarkdown: '   ' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when planMarkdown exceeds max length', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(
      makeTask({ planState: TaskPlanState.PLAN_READY })
    )
    const res = await server.inject({
      method: 'POST',
      url: '/tasks/task-1/approve',
      payload: { planMarkdown: 'x'.repeat(500_001) },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('exceeds maximum')
  })
})

describe('POST /tasks/:taskId/retry', () => {
  let server: FastifyInstance
  let dbService: any

  beforeEach(async () => {
    const mod = await import('../src/database.js')
    dbService = mod.dbService
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => { await server.close() })

  it('returns 404 when task not found', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(null)
    const res = await server.inject({ method: 'POST', url: '/tasks/x/retry' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 409 when task is active', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(makeTask())
    const activeTasks = new Set(['task-1'])
    const localServer = await createApiServer(buildDependencies({ activeTasks }))
    const res = await localServer.inject({ method: 'POST', url: '/tasks/task-1/retry' })
    expect(res.statusCode).toBe(409)
    await localServer.close()
  })

  it('returns 400 for invalid retry mode', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(
      makeTask({ status: TASK_STATUS.FAILED })
    )
    const res = await server.inject({
      method: 'POST',
      url: '/tasks/task-1/retry',
      payload: { mode: 'invalid' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /tasks/:taskId/cancel', () => {
  let server: FastifyInstance
  let dbService: any

  beforeEach(async () => {
    const mod = await import('../src/database.js')
    dbService = mod.dbService
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => { await server.close() })

  it('returns 404 when task not found', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(null)
    const res = await server.inject({ method: 'POST', url: '/tasks/x/cancel' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 409 for terminal task', async () => {
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(
      makeTask({ status: TASK_STATUS.COMPLETED })
    )
    const res = await server.inject({ method: 'POST', url: '/tasks/task-1/cancel' })
    expect(res.statusCode).toBe(409)
  })
})
