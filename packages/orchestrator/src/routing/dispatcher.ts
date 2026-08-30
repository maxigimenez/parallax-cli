import {
  COMMENT_TARGET,
  MAX_CONCURRENT_RUNS_PER_AGENT,
  RUN_STATUS,
  type AgentDescriptor,
  type CommentTarget,
  type Logger,
  type RoutingRule,
  type RunRecord,
  type TriggerEvent,
} from '@parallax/common'
import type { ParallaxDatabase } from '../database.js'
import type { HermesAdapter } from '../hermes/adapter.js'
import { renderPrompt } from '../prompts/templates.js'
import { resolveSummary } from '../prompts/output-contract.js'
import { dedupeKey, evaluate } from './rule-engine.js'
import type { RunLifecycle } from './run-lifecycle.js'

export type DispatchResult =
  | { outcome: 'dispatched'; runId: string; status: RunRecord['status'] }
  | { outcome: 'skipped'; reason: SkipReason; detail?: string }
  | { outcome: 'failed'; runId?: string; reason: string }

export type SkipReason = 'no-route' | 'duplicate' | 'unknown-agent' | 'agent-busy'

/**
 * Side effects Parallax owns after a run finishes.
 *
 * Injected rather than imported so the dispatcher is testable without GitHub or
 * Linear, and so the tracker write path stays in one place.
 */
export interface OutcomeHandlers {
  postComment(target: CommentTarget, event: TriggerEvent, body: string): Promise<void>
  updateLabels(event: TriggerEvent, labels: { add?: string[]; remove?: string[] }): Promise<void>
}

export interface DispatcherDeps {
  db: ParallaxDatabase
  logger: Logger
  lifecycle: RunLifecycle
  outcomes: OutcomeHandlers
  /** Adapter per Hermes profile. */
  adapters: Map<string, HermesAdapter>
  agents: AgentDescriptor[]
  newRunId: () => string
  now?: () => number
  /** Registry of in-flight runs, so the API can abort one by id. */
  inFlight?: Map<string, AbortController>
}

export class Dispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Resolve `target.agentRef` to a concrete, enabled profile. */
  private resolveAgent(route: RoutingRule): AgentDescriptor | undefined {
    const { profile, githubLogin } = route.target.agentRef
    return this.deps.agents.find((agent) => {
      if (!agent.enabled) {
        return false
      }
      if (profile) {
        return agent.profile === profile
      }
      if (githubLogin) {
        return agent.githubLogin?.toLowerCase() === githubLogin.toLowerCase()
      }
      return false
    })
  }

  /**
   * @param onDecision Called the moment routing is decided, before the agent
   *   run begins. A run can take half an hour, so anything that wants to report
   *   on routing -- a per-cycle summary, say -- cannot wait for the promise.
   */
  async dispatch(
    event: TriggerEvent,
    routes: readonly RoutingRule[],
    onDecision?: (decision: DispatchResult | { outcome: 'started'; runId: string }) => void
  ): Promise<DispatchResult> {
    const decide = <T extends DispatchResult>(result: T): T => {
      onDecision?.(result)
      return result
    }

    const route = evaluate(routes, event)
    if (!route) {
      return decide({ outcome: 'skipped', reason: 'no-route' })
    }

    const agent = this.resolveAgent(route)
    if (!agent) {
      const ref = route.target.agentRef
      const detail = `Route "${route.id}" targets ${ref.profile ? `profile "${ref.profile}"` : `github login "${ref.githubLogin}"`}, which is not a known enabled agent.`
      this.deps.logger.warn(detail)
      return decide({ outcome: 'skipped', reason: 'unknown-agent', detail })
    }

    // Hermes corrupts a profile's memory if two agents drive it concurrently.
    // Deferring rather than queueing is deliberate: the trigger will still be
    // there next cycle, and the dedupe key is not claimed, so nothing is lost.
    if (this.deps.db.countActiveRunsForAgent(agent.profile) >= MAX_CONCURRENT_RUNS_PER_AGENT) {
      return decide({
        outcome: 'skipped',
        reason: 'agent-busy',
        detail: `Agent "${agent.profile}" is already running; deferring ${event.ref}.`,
      })
    }

    const adapter = this.deps.adapters.get(agent.profile)
    if (!adapter) {
      return decide({
        outcome: 'skipped',
        reason: 'unknown-agent',
        detail: `No Hermes client configured for profile "${agent.profile}".`,
      })
    }

    const key = dedupeKey(route, event)
    const runId = this.deps.newRunId()

    // Claim before any work: this is what makes a re-observed, unchanged ticket
    // a no-op on every subsequent poll cycle.
    if (
      !this.deps.db.claimDispatch(
        key,
        { runId, routeId: route.id, triggerRef: event.ref },
        this.now()
      )
    ) {
      return decide({ outcome: 'skipped', reason: 'duplicate' })
    }

    let prompt: string
    try {
      prompt = renderPrompt({ event, route, agentRole: agent.role })
    } catch (error: unknown) {
      // A bad template is a config error that will not fix itself on retry, but
      // releasing the claim keeps the trigger live so a corrected route can run.
      this.deps.db.releaseDispatch(key)
      const reason = error instanceof Error ? error.message : String(error)
      this.deps.logger.error(reason)
      return decide({ outcome: 'failed', reason })
    }

    const now = this.now()
    const record: RunRecord = {
      id: runId,
      routeId: route.id,
      routeName: route.name,
      agentProfile: agent.profile,
      projectId: event.projectId,
      triggerType: event.type,
      triggerRef: event.ref,
      triggerRevision: event.revision,
      triggerUrl: event.url,
      title: event.title,
      status: RUN_STATUS.QUEUED,
      createdAt: now,
      updatedAt: now,
    }
    this.deps.db.createRun(record)
    onDecision?.({ outcome: 'started', runId })

    const controller = new AbortController()
    this.deps.inFlight?.set(runId, controller)
    let hermesRunId: string | undefined

    try {
      this.deps.lifecycle.running(runId, `Dispatched ${event.ref} to agent "${agent.profile}"`)

      const result = await adapter.run(
        {
          runId,
          prompt,
          model: route.execution.modelOverride ?? agent.model ?? null,
          timeoutSeconds: route.execution.timeoutSeconds,
          // Persisted immediately so a cancel arriving mid-run has something to
          // stop, and so a runner restart can still reach an orphaned run.
          onRunCreated: (id) => {
            hermesRunId = id
            this.deps.lifecycle.attachHermesRun(runId, id)
          },
        },
        controller.signal
      )

      this.deps.lifecycle.attachHermesRun(runId, result.hermesRunId, result.sessionId)

      const summary = resolveSummary(result.output)

      switch (result.status) {
        case RUN_STATUS.COMPLETED:
          this.deps.lifecycle.completed(runId, summary, result.usage)
          await this.applyOutcomes(route, event, summary ?? 'Run completed with no summary.')
          break
        case RUN_STATUS.AWAITING_APPROVAL:
          this.deps.lifecycle.awaitingApproval(runId)
          break
        case RUN_STATUS.CANCELED:
          this.deps.lifecycle.canceled(runId, result.error)
          break
        default:
          this.deps.lifecycle.failed(runId, result.error ?? 'Agent run failed.', result.usage)
          // The tracker still hears about it: a failure the humans never see is
          // the worst outcome, and it is exactly the case an agent cannot report
          // on its own behalf.
          await this.postFailure(route, event, result.error ?? 'Agent run failed.')
          break
      }

      return { outcome: 'dispatched', runId, status: result.status }
    } catch (error: unknown) {
      // An abort can land anywhere -- including in the window before Hermes has
      // even accepted the run -- and surfaces as a rejection rather than a
      // status. Classifying on the signal keeps "the operator cancelled it"
      // from being reported as "the agent failed".
      if (controller.signal.aborted) {
        // The adapter's own cancel path did not get to run, so stopping the
        // Hermes side is this branch's job -- otherwise the agent keeps working
        // on a run Parallax has already written off.
        if (hermesRunId) {
          await adapter.cancel(hermesRunId).catch((stopError: unknown) => {
            this.deps.logger.warn(
              `Canceled ${runId} locally but could not stop Hermes run ${hermesRunId}: ${stopError instanceof Error ? stopError.message : String(stopError)}`
            )
          })
        } else {
          // Aborted before Hermes acknowledged the run. It may or may not exist
          // there; nothing identifies it, so say so rather than pretend.
          this.deps.logger.warn(
            `Canceled ${runId} before Hermes acknowledged it; a run may be orphaned on profile "${agent.profile}".`
          )
        }
        this.deps.lifecycle.canceled(runId, 'Canceled by operator.')
        return { outcome: 'dispatched', runId, status: RUN_STATUS.CANCELED }
      }
      const reason = error instanceof Error ? error.message : String(error)
      this.deps.lifecycle.failed(runId, reason)
      await this.postFailure(route, event, reason)
      return { outcome: 'failed', runId, reason }
    } finally {
      this.deps.inFlight?.delete(runId)
    }
  }

  private async applyOutcomes(
    route: RoutingRule,
    event: TriggerEvent,
    body: string
  ): Promise<void> {
    const target = route.outcome.postComment?.target
    if (target && target !== COMMENT_TARGET.NONE) {
      await this.safely(() => this.deps.outcomes.postComment(target, event, body), 'post comment')
    }
    if (route.outcome.labels) {
      await this.safely(
        () => this.deps.outcomes.updateLabels(event, route.outcome.labels!),
        'update labels'
      )
    }
  }

  private async postFailure(route: RoutingRule, event: TriggerEvent, error: string): Promise<void> {
    const target = route.outcome.postComment?.target
    if (!target || target === COMMENT_TARGET.NONE) {
      return
    }
    await this.safely(
      () => this.deps.outcomes.postComment(target, event, `Parallax run failed: ${error}`),
      'post failure comment'
    )
  }

  /** An outcome handler failing must not reclassify an otherwise-successful run. */
  private async safely(action: () => Promise<void>, label: string): Promise<void> {
    try {
      await action()
    } catch (error: unknown) {
      this.deps.logger.warn(
        `Failed to ${label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
