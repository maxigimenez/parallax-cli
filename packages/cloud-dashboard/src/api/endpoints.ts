import { request } from './client.js'
import type {
  Agent,
  ApiKey,
  Project,
  PromptTemplate,
  RouteTemplate,
  RoutingRule,
  Run,
  RunEvent,
  Runner,
  SlackIntegration,
} from './types.js'

/**
 * Every call the dashboard makes, in one place.
 *
 * Each unwraps the API's single-key envelope (`{ runs: [...] }`) so screens
 * deal in the data and not in the transport shape.
 */
export const api = {
  runners: (key: string, signal?: AbortSignal) =>
    request<{ runners: Runner[] }>(key, '/v1/runners', { signal }).then((r) => r.runners),

  agents: (key: string, signal?: AbortSignal) =>
    request<{ agents: Agent[] }>(key, '/v1/agents', { signal }).then((r) => r.agents),

  projects: (key: string, signal?: AbortSignal) =>
    request<{ projects: Project[] }>(key, '/v1/projects', { signal }).then((r) => r.projects),

  createProject: (key: string, body: { id: string; provider: string; filters?: unknown }) =>
    request<{ id: string }>(key, '/v1/projects', { method: 'POST', body }),

  deleteProject: (key: string, id: string) =>
    request<{ ok: true }>(key, `/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  routes: (key: string, signal?: AbortSignal) =>
    request<{ routes: RoutingRule[] }>(key, '/v1/routes', { signal }).then((r) => r.routes),

  route: (key: string, id: string, signal?: AbortSignal) =>
    request<{ route: RoutingRule }>(key, `/v1/routes/${encodeURIComponent(id)}`, { signal }).then(
      (r) => r.route
    ),

  createRoute: (key: string, body: unknown) =>
    request<{ route: RoutingRule }>(key, '/v1/routes', { method: 'POST', body }).then(
      (r) => r.route
    ),

  updateRoute: (key: string, id: string, body: unknown) =>
    request<{ route: RoutingRule }>(key, `/v1/routes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    }).then((r) => r.route),

  deleteRoute: (key: string, id: string) =>
    request<{ ok: true }>(key, `/v1/routes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  routeTemplates: (key: string, signal?: AbortSignal) =>
    request<{ templates: RouteTemplate[] }>(key, '/v1/route-templates', { signal }).then(
      (r) => r.templates
    ),

  promptTemplates: (key: string, signal?: AbortSignal) =>
    request<{ templates: PromptTemplate[]; variables: string[] }>(key, '/v1/prompt-templates', {
      signal,
    }),

  runs: (key: string, params: { status?: string; limit?: number } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    if (params.status) {
      query.set('status', params.status)
    }
    query.set('limit', String(params.limit ?? 100))
    return request<{ runs: Run[] }>(key, `/v1/runs?${query}`, { signal }).then((r) => r.runs)
  },

  run: (key: string, id: string, signal?: AbortSignal) =>
    request<{ run: Run }>(key, `/v1/runs/${encodeURIComponent(id)}`, { signal }).then((r) => r.run),

  runEvents: (key: string, id: string, signal?: AbortSignal) =>
    request<{ events: RunEvent[] }>(key, `/v1/runs/${encodeURIComponent(id)}/events`, {
      signal,
    }).then((r) => r.events),

  cancelRun: (key: string, id: string) =>
    request<{ queued: string }>(key, `/v1/runs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),

  resync: (key: string) => request<{ queued: string }>(key, '/v1/resync', { method: 'POST' }),

  keys: (key: string, signal?: AbortSignal) =>
    request<{ keys: ApiKey[] }>(key, '/v1/keys', { signal }).then((r) => r.keys),

  createKey: (key: string, body: { name: string; scope: 'runner' | 'user' }) =>
    request<{ id: string; key: string; scope: string; prefix: string }>(key, '/v1/keys', {
      method: 'POST',
      body,
    }),

  revokeKey: (key: string, id: string) =>
    request<{ ok: true }>(key, `/v1/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  slack: (key: string, signal?: AbortSignal) =>
    request<SlackIntegration>(key, '/v1/integrations/slack', { signal }),

  saveSlack: (key: string, body: { webhookUrl: string; enabled?: boolean }) =>
    request<{ ok: true }>(key, '/v1/integrations/slack', { method: 'PUT', body }),

  deleteSlack: (key: string) =>
    request<{ ok: true }>(key, '/v1/integrations/slack', { method: 'DELETE' }),
}
