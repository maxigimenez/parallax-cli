import type {
  AgentDescriptor,
  CloudConfig,
  ProjectConfig,
  RoutingRule,
  RunLogEntry,
  RunRecord,
} from '@parallax/common'

export interface RunnerCommand {
  id: string
  cursor: number
  type: 'run' | 'cancel' | 'resync' | 'run-prompt'
  payload: Record<string, unknown>
}

export interface HelloResponse {
  runnerId: string
  routesRevision: string
}

export interface RoutesResponse {
  revision: string
  routes: RoutingRule[]
}

export interface ProjectsResponse {
  projects: ProjectConfig[]
}

export class CloudApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string
  ) {
    super(`Parallax cloud ${status} at ${path}: ${body.slice(0, 300)}`)
    this.name = 'CloudApiError'
  }
}

/** Long-poll window. The server holds the request open for up to this long. */
const POLL_WAIT_SECONDS = 25

/** Long-polling needs a client timeout comfortably above the server's hold. */
const POLL_TIMEOUT_MS = (POLL_WAIT_SECONDS + 10) * 1_000
const DEFAULT_TIMEOUT_MS = 15_000

export class CloudClient {
  private readonly root: string

  constructor(
    private readonly config: CloudConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.root = config.baseUrl.replace(/\/+$/, '')
  }

  get runnerName(): string {
    return this.config.runnerName
  }

  private async request<T>(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {}
  ): Promise<T> {
    const { timeoutMs, ...rest } = init
    const response = await this.fetchImpl(`${this.root}${path}`, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(rest.headers as Record<string, string> | undefined),
      },
    })

    if (!response.ok) {
      throw new CloudApiError(response.status, path, await response.text().catch(() => ''))
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
  }

  private post<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body), timeoutMs })
  }

  hello(hostname: string, version: string): Promise<HelloResponse> {
    return this.post<HelloResponse>('/v1/runner/hello', {
      name: this.config.runnerName,
      hostname,
      version,
    })
  }

  /**
   * Periodic proof of life, with enough detail to be worth reading.
   *
   * The runner accepts no inbound connections, so nothing can ask it how it is
   * doing — health has to be pushed or it does not exist. Sent once per poll
   * cycle, which is roughly every 25 seconds against a 90-second staleness
   * window, so three have to be missed before anything is reported wrong.
   */
  heartbeat(health: RunnerHealth): Promise<void> {
    return this.post<void>('/v1/runner/heartbeat', {
      name: this.config.runnerName,
      ...health,
    })
  }

  pushInventory(agents: AgentDescriptor[]): Promise<void> {
    return this.request<void>('/v1/runner/inventory', {
      method: 'PUT',
      body: JSON.stringify({ agents }),
    })
  }

  fetchRoutes(): Promise<RoutesResponse> {
    return this.request<RoutesResponse>('/v1/runner/routes')
  }

  fetchProjects(): Promise<ProjectsResponse> {
    return this.request<ProjectsResponse>('/v1/runner/projects')
  }

  /**
   * Long-poll for work queued by a human.
   *
   * The server holds the connection open until something arrives or the window
   * closes, so an empty array is the normal, healthy result -- not an error.
   */
  pollCommands(cursor: number, signal?: AbortSignal): Promise<{ commands: RunnerCommand[] }> {
    // Naming ourselves is what lets the cloud address a command at one machine.
    // A command that names no runner is still delivered to everyone, so this is
    // additive: it narrows what this runner may claim, never what it receives.
    return this.request<{ commands: RunnerCommand[] }>(
      `/v1/runner/commands?cursor=${cursor}&wait=${POLL_WAIT_SECONDS}&runner=${encodeURIComponent(this.config.runnerName)}`,
      { timeoutMs: POLL_TIMEOUT_MS, signal }
    )
  }

  ackCommands(throughCursor: number): Promise<void> {
    // Same filter as the poll: acking by cursor alone would mark another
    // runner's addressed commands delivered before it ever fetched them.
    return this.post<void>('/v1/runner/commands/ack', {
      cursor: throughCursor,
      runner: this.config.runnerName,
    })
  }

  mirrorRun(run: RunRecord): Promise<void> {
    return this.post<void>('/v1/runner/runs', { run })
  }

  mirrorRunUpdate(run: RunRecord): Promise<void> {
    return this.request<void>(`/v1/runner/runs/${encodeURIComponent(run.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ run }),
    })
  }

  mirrorEvents(runId: string, events: RunLogEntry[]): Promise<void> {
    return this.post<void>(`/v1/runner/runs/${encodeURIComponent(runId)}/events`, { events })
  }
}

/** What the runner reports about itself on each cycle. */
export interface RunnerHealth {
  startedAt: string
  hermesOk: boolean
  hermesDetail: string
  activeRuns: number
  lastError: string | null
}

export type OutboxItem =
  | { kind: 'run'; run: RunRecord }
  | { kind: 'run-update'; run: RunRecord }
  | { kind: 'events'; runId: string; events: RunLogEntry[] }

/**
 * Buffers mirror writes so a cloud outage cannot stall or fail a run.
 *
 * Deliberately in-memory and bounded: the runner's SQLite is the source of
 * truth, so the cloud mirror is allowed to lose history rather than grow without
 * limit or block the dispatcher. A runner restart during an outage loses the
 * buffered tail, which is the accepted trade.
 */
export class MirrorOutbox {
  private queue: OutboxItem[] = []

  constructor(
    private readonly client: CloudClient,
    private readonly onError: (message: string) => void,
    private readonly maxItems = 500
  ) {}

  get size(): number {
    return this.queue.length
  }

  enqueue(item: OutboxItem): void {
    this.queue.push(item)
    if (this.queue.length > this.maxItems) {
      const dropped = this.queue.length - this.maxItems
      this.queue.splice(0, dropped)
      this.onError(`Mirror outbox full; dropped ${dropped} oldest item(s).`)
    }
  }

  /** Flushes in order, stopping at the first failure so ordering is preserved. */
  async flush(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue[0]
      try {
        if (item.kind === 'run') {
          await this.client.mirrorRun(item.run)
        } else if (item.kind === 'run-update') {
          await this.client.mirrorRunUpdate(item.run)
        } else {
          await this.client.mirrorEvents(item.runId, item.events)
        }
        this.queue.shift()
      } catch (error: unknown) {
        this.onError(
          `Cloud mirror deferred (${this.queue.length} pending): ${error instanceof Error ? error.message : String(error)}`
        )
        return
      }
    }
  }
}
