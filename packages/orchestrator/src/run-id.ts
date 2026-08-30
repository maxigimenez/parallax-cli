import { randomUUID } from 'node:crypto'

/**
 * Run identifiers are random, not derived from the trigger.
 *
 * The predecessor hashed (projectId, externalId), which meant one ticket could
 * only ever have one task. Routing breaks that assumption on purpose: the same
 * ticket may be dispatched repeatedly as it changes, and to different agents.
 * Dedupe is the ledger's job, not the id's.
 */
export function createRunId(): string {
  return `pxr_${randomUUID().replace(/-/g, '').slice(0, 20)}`
}
