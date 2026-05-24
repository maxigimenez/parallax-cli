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
vi.mock('../src/config-store.js', () => ({
  readConfigStore: vi.fn().mockResolvedValue({
    version: 1,
    projects: [],
    slack: null,
    secrets: {},
    updatedAt: 0,
  }),
  writeConfigStore: vi.fn().mockResolvedValue(undefined),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

function buildDependencies(overrides: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn().mockReturnValue({ projects: [], slack: null }),
    reloadRuntime: vi.fn().mockResolvedValue({ projects: [], slack: null }),
    triggerPullRequestReview: vi.fn(),
    gitService: { getWorktreeChangedFiles: vi.fn(), getTaskUnifiedDiff: vi.fn() } as any,
    activeTasks: new Set<string>(),
    canceledTasks: new Set<string>(),
    activeWorktrees: new Map<string, string>(),
    dataDir: '/tmp/test-parallax',
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
      headers: { origin: 'http://localhost:9371' },
    })
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:9371')
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

  it('allows PUT and DELETE in preflight response', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/integrations/slack',
      headers: {
        origin: 'http://localhost:9372',
        'access-control-request-method': 'PUT',
      },
    })
    const allowed = res.headers['access-control-allow-methods'] ?? ''
    expect(allowed).toContain('PUT')
    expect(allowed).toContain('DELETE')
  })
})

describe('GET /tasks', () => {
  let server: FastifyInstance

  beforeEach(async () => {
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => {
    await server.close()
  })

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

  afterEach(async () => {
    await server.close()
  })

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

  afterEach(async () => {
    await server.close()
  })

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

  afterEach(async () => {
    await server.close()
  })

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

  afterEach(async () => {
    await server.close()
  })

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
    vi.mocked(dbService.getTaskByLookup).mockReturnValue(makeTask({ status: TASK_STATUS.FAILED }))
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

  afterEach(async () => {
    await server.close()
  })

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

describe('DELETE /projects/:projectId', () => {
  let server: FastifyInstance
  let dbService: any

  beforeEach(async () => {
    const mod = await import('../src/database.js')
    dbService = mod.dbService
    server = await createApiServer(
      buildDependencies({
        getConfig: vi.fn().mockReturnValue({
          projects: [{ id: 'proj-1' }],
          slack: null,
        }),
      })
    )
  })

  afterEach(async () => {
    await server.close()
  })

  it('returns 404 when project not found', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/projects/unknown' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toContain('"unknown" not found')
  })

  it('returns 409 when project has active tasks', async () => {
    vi.mocked(dbService.listTasks).mockReturnValue([{ id: 'task-1', projectId: 'proj-1' }])
    const localServer = await createApiServer(
      buildDependencies({
        getConfig: vi.fn().mockReturnValue({ projects: [{ id: 'proj-1' }], slack: null }),
        activeTasks: new Set(['task-1']),
      })
    )
    const res = await localServer.inject({ method: 'DELETE', url: '/projects/proj-1' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toContain('active task')
    await localServer.close()
  })

  it('returns 200 when project has no active tasks', async () => {
    vi.mocked(dbService.listTasks).mockReturnValue([])
    const res = await server.inject({ method: 'DELETE', url: '/projects/proj-1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('returns 200 when task belongs to project but is not active', async () => {
    vi.mocked(dbService.listTasks).mockReturnValue([{ id: 'task-1', projectId: 'proj-1' }])
    // task-1 is not in activeTasks
    const res = await server.inject({ method: 'DELETE', url: '/projects/proj-1' })
    expect(res.statusCode).toBe(200)
  })
})

describe('PATCH /secrets/:key', () => {
  let server: FastifyInstance

  beforeEach(async () => {
    server = await createApiServer(buildDependencies())
  })

  afterEach(async () => {
    await server.close()
  })

  it('returns 400 for key starting with a digit', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/1INVALID',
      payload: { value: 'secret' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('environment variable name')
  })

  it('returns 400 for key containing spaces', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/MY%20KEY',
      payload: { value: 'secret' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('environment variable name')
  })

  it('returns 400 for key containing hyphens', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/MY-KEY',
      payload: { value: 'secret' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('environment variable name')
  })

  it('returns 400 when value is missing', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/VALID_KEY',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('value must be a string')
  })

  it('returns 400 when value is empty', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/VALID_KEY',
      payload: { value: '' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('must not be empty')
  })

  it('returns 200 for valid snake_case key', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/LINEAR_API_KEY',
      payload: { value: 'lin_abc123' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('returns 200 for lowercase key', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/secrets/my_token',
      payload: { value: 'somevalue' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('PUT /integrations/slack', () => {
  let server: FastifyInstance

  afterEach(async () => {
    await server.close()
  })

  it('returns 400 when bot token is missing on new connection', async () => {
    server = await createApiServer(buildDependencies())
    const res = await server.inject({
      method: 'PUT',
      url: '/integrations/slack',
      payload: { appToken: 'xapp-1', channel: '#eng' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('botToken')
  })

  it('returns 200 when tokens are omitted on update with existing config', async () => {
    server = await createApiServer(
      buildDependencies({
        getConfig: vi.fn().mockReturnValue({
          projects: [],
          slack: { botToken: 'xoxb-real', appToken: 'xapp-real', channel: '#old' },
        }),
      })
    )
    const res = await server.inject({
      method: 'PUT',
      url: '/integrations/slack',
      payload: { channel: '#new-channel' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('returns 400 when new token has invalid prefix even on update', async () => {
    server = await createApiServer(
      buildDependencies({
        getConfig: vi.fn().mockReturnValue({
          projects: [],
          slack: { botToken: 'xoxb-real', appToken: 'xapp-real', channel: '#old' },
        }),
      })
    )
    const res = await server.inject({
      method: 'PUT',
      url: '/integrations/slack',
      payload: { botToken: 'invalid-token', channel: '#eng' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('xoxb-')
  })
})
