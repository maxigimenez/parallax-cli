/**
 * Wire types for the Hermes Agent API server.
 *
 * Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
 * These shapes are documented but UNVERIFIED against the deployment on `cerebro`
 * (see M0 in the pivot plan). Everything here is parsed defensively for that
 * reason: unknown fields are ignored rather than rejected, and every optional
 * field is treated as genuinely optional.
 */

export interface HermesCapabilities {
  object?: string
  platform?: string
  model?: string
  auth?: { type?: string; required?: boolean }
  features?: Record<string, boolean>
}

export interface HermesModel {
  id: string
  object?: string
  owned_by?: string
}

export interface HermesSkill {
  name: string
  description?: string
  category?: string
}

export interface HermesToolset {
  name: string
  label?: string
  description?: string
  enabled?: boolean
  configured?: boolean
  tools?: string[]
}

export interface HermesCreateRunRequest {
  input: string
  session_id?: string
  instructions?: string
  previous_response_id?: string
  model?: string
  provider?: string
  model_options?: Record<string, unknown>
}

export interface HermesCreateRunResponse {
  run_id: string
  status?: string
}

export interface HermesUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

export interface HermesRunState {
  run_id?: string
  status: string
  output?: unknown
  usage?: HermesUsage
  error?: string
  session_id?: string
  response_id?: string
}

/** One decoded server-sent event from `GET /v1/runs/{id}/events`. */
export interface HermesStreamEvent {
  event: string
  data: unknown
}

/**
 * Hermes run statuses, normalized. Hermes spells cancellation "cancelled";
 * Sentinel0 uses "canceled" everywhere, so the mapping happens once, here.
 */
export const HERMES_TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'canceled',
  'error',
  'expired',
])

export function isHermesTerminalStatus(status: string): boolean {
  return HERMES_TERMINAL_STATUSES.has(status.toLowerCase())
}
