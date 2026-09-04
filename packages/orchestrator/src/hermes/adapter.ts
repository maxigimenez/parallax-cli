import { RUN_STATUS, type Logger, type RunStatus, type RunUsage } from '@sentinel0/common'
import type { HermesClient } from './client.js'
import { mapHermesEvent, extractText } from './event-mapper.js'
import { isHermesTerminalStatus, type HermesCapabilities, type HermesRunState } from './types.js'

export interface HermesRunJob {
  /** Sentinel0 run id — used for log correlation, not sent to Hermes. */
  runId: string
  prompt: string
  instructions?: string
  sessionId?: string
  previousResponseId?: string
  model?: string | null
  timeoutSeconds: number
  /**
   * Called the moment Hermes accepts the run, before any polling.
   *
   * This is what makes mid-run cancellation possible: the id has to be durable
   * from the first instant, not recorded once the run is already over.
   */
  onRunCreated?: (hermesRunId: string) => void
}

export interface HermesRunOutcome {
  status: RunStatus
  hermesRunId: string
  output: string
  error?: string
  usage?: RunUsage
  sessionId?: string
}

export interface HermesAdapterOptions {
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 3_000

/** Hermes says "cancelled"; Sentinel0 says "canceled". Normalize once. */
export function mapHermesStatus(status: string): RunStatus {
  const normalized = status.toLowerCase()
  if (normalized.includes('approval')) {
    return RUN_STATUS.AWAITING_APPROVAL
  }
  if (normalized === 'completed' || normalized === 'succeeded') {
    return RUN_STATUS.COMPLETED
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return RUN_STATUS.CANCELED
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'expired') {
    return RUN_STATUS.FAILED
  }
  return RUN_STATUS.RUNNING
}

function toUsage(state: HermesRunState): RunUsage | undefined {
  const usage = state.usage
  if (!usage) {
    return undefined
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  }
}

/**
 * Drives a single Hermes profile.
 *
 * The critical design point: **the SSE stream is progress, the poll is truth.**
 * Hermes expires run event buffers after five minutes, so a run longer than
 * that will have its stream end while the run is still going. Completion is
 * therefore decided exclusively by polling `GET /v1/runs/{id}`; the stream only
 * ever feeds the log viewer, and any stream failure is logged and swallowed.
 */
export class HermesAdapter {
  private readonly pollIntervalMs: number

  constructor(
    private readonly client: HermesClient,
    private readonly logger: Logger,
    options: HermesAdapterOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  }

  get profile(): string {
    return this.client.profile
  }

  /** Whether the gateway answers, and what it says it is. Used for health. */
  async capabilities(): Promise<HermesCapabilities> {
    return this.client.capabilities()
  }

  async cancel(hermesRunId: string): Promise<void> {
    await this.client.stopRun(hermesRunId)
  }

  async run(job: HermesRunJob, signal?: AbortSignal): Promise<HermesRunOutcome> {
    const created = await this.client.createRun(
      {
        input: job.prompt,
        ...(job.instructions ? { instructions: job.instructions } : {}),
        ...(job.sessionId ? { session_id: job.sessionId } : {}),
        ...(job.previousResponseId ? { previous_response_id: job.previousResponseId } : {}),
        ...(job.model ? { model: job.model } : {}),
      },
      signal
    )

    const hermesRunId = created.run_id
    if (!hermesRunId) {
      throw new Error(`Hermes profile "${this.client.profile}" returned no run_id.`)
    }

    job.onRunCreated?.(hermesRunId)
    this.logger.info(
      `Hermes run ${hermesRunId} started on profile ${this.client.profile}`,
      job.runId
    )

    const streamAbort = new AbortController()
    const streaming = this.consumeStream(job.runId, hermesRunId, streamAbort.signal)

    try {
      return await this.pollUntilSettled(job, hermesRunId, signal)
    } finally {
      streamAbort.abort()
      // Surfaced inside consumeStream; awaited only so the task cannot outlive the run.
      await streaming.catch(() => undefined)
    }
  }

  private async consumeStream(
    runId: string,
    hermesRunId: string,
    signal: AbortSignal
  ): Promise<void> {
    try {
      for await (const event of this.client.streamRunEvents(hermesRunId, signal)) {
        const entry = mapHermesEvent(event)
        if (!entry) {
          continue
        }
        this.logger.event({
          runId,
          title: entry.title,
          message: entry.message,
          level: entry.level,
          kind: entry.kind,
          source: entry.source,
          icon: entry.icon,
          groupId: entry.groupId,
        })
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        return
      }
      // Never fatal: losing progress output must not fail an otherwise fine run.
      this.logger.warn(
        `Hermes event stream ended early for ${hermesRunId}: ${errorMessage(error)}`,
        runId
      )
    }
  }

  private async pollUntilSettled(
    job: HermesRunJob,
    hermesRunId: string,
    signal?: AbortSignal
  ): Promise<HermesRunOutcome> {
    const deadline = Date.now() + job.timeoutSeconds * 1_000
    let lastState: HermesRunState | undefined

    for (;;) {
      if (signal?.aborted) {
        await this.stopQuietly(hermesRunId, job.runId)
        return this.outcome(RUN_STATUS.CANCELED, hermesRunId, lastState, 'Canceled by operator.')
      }

      if (Date.now() > deadline) {
        await this.stopQuietly(hermesRunId, job.runId)
        return this.outcome(
          RUN_STATUS.FAILED,
          hermesRunId,
          lastState,
          `Run exceeded its ${job.timeoutSeconds}s timeout and was stopped.`
        )
      }

      try {
        lastState = await this.client.getRun(hermesRunId, signal)
      } catch (error: unknown) {
        // A transient poll failure is not a run failure; the deadline is the
        // only thing that ends the loop unhappily.
        this.logger.warn(
          `Hermes status poll failed for ${hermesRunId}: ${errorMessage(error)}`,
          job.runId
        )
      }

      if (lastState && isHermesTerminalStatus(lastState.status)) {
        const status = mapHermesStatus(lastState.status)
        return this.outcome(status, hermesRunId, lastState, lastState.error)
      }

      if (lastState && mapHermesStatus(lastState.status) === RUN_STATUS.AWAITING_APPROVAL) {
        return this.outcome(RUN_STATUS.AWAITING_APPROVAL, hermesRunId, lastState)
      }

      await delay(this.pollIntervalMs, signal)
    }
  }

  private async stopQuietly(hermesRunId: string, runId: string): Promise<void> {
    try {
      await this.client.stopRun(hermesRunId)
    } catch (error: unknown) {
      this.logger.warn(`Failed to stop Hermes run ${hermesRunId}: ${errorMessage(error)}`, runId)
    }
  }

  private outcome(
    status: RunStatus,
    hermesRunId: string,
    state: HermesRunState | undefined,
    error?: string
  ): HermesRunOutcome {
    return {
      status,
      hermesRunId,
      output: state ? extractText(state.output) : '',
      error,
      usage: state ? toUsage(state) : undefined,
      sessionId: state?.session_id,
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}
