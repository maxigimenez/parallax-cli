import { RUN_STATUS, type Logger, type RunStatus, type RunUsage } from '@parallax/common'
import type { ParallaxDatabase } from '../database.js'

/**
 * The single place a run's status changes.
 *
 * Every transition writes the database and emits a lifecycle event together, so
 * a run's stored status and its visible history can never disagree. Terminal
 * transitions always stamp `endedAt`, which is what the cloud mirror and the
 * Slack notifier use to report duration.
 */
export class RunLifecycle {
  constructor(
    private readonly db: ParallaxDatabase,
    private readonly logger: Logger
  ) {}

  private transition(
    runId: string,
    status: RunStatus,
    message: string,
    icon: string,
    extra: { summary?: string; error?: string; usage?: RunUsage } = {}
  ): void {
    const now = Date.now()
    this.db.updateRun(
      runId,
      {
        status,
        ...extra,
        ...(status === RUN_STATUS.RUNNING ? { startedAt: now } : {}),
        ...(status === RUN_STATUS.COMPLETED ||
        status === RUN_STATUS.FAILED ||
        status === RUN_STATUS.CANCELED
          ? { endedAt: now }
          : {}),
      },
      now
    )

    this.logger.event({
      runId,
      message,
      icon,
      kind: 'lifecycle',
      source: 'system',
      level: status === RUN_STATUS.FAILED ? 'error' : 'info',
    })
  }

  queued(runId: string, message = 'Queued'): void {
    this.transition(runId, RUN_STATUS.QUEUED, message, '.')
  }

  running(runId: string, message = 'Dispatched to agent'): void {
    this.transition(runId, RUN_STATUS.RUNNING, message, '>')
  }

  awaitingApproval(runId: string, message = 'Waiting for approval'): void {
    this.transition(runId, RUN_STATUS.AWAITING_APPROVAL, message, '?')
  }

  completed(runId: string, summary?: string, usage?: RunUsage): void {
    this.transition(runId, RUN_STATUS.COMPLETED, summary ?? 'Completed', 'v', { summary, usage })
  }

  failed(runId: string, error: string, usage?: RunUsage): void {
    this.transition(runId, RUN_STATUS.FAILED, error, 'x', { error, usage })
  }

  canceled(runId: string, reason = 'Canceled'): void {
    this.transition(runId, RUN_STATUS.CANCELED, reason, '-', { error: reason })
  }

  /** Records the Hermes-side identifiers as soon as they are known. */
  attachHermesRun(runId: string, hermesRunId: string, sessionId?: string): void {
    this.db.updateRun(runId, { hermesRunId, hermesSessionId: sessionId })
  }
}
