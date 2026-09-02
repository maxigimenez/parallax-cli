import type { ReactNode } from 'react'
import { Avatar } from '@16-bits-design/ui/avatar'
import { Badge } from '@16-bits-design/ui/badge'
import { Text } from '@16-bits-design/ui/typography'
import { api } from '../api/endpoints.js'
import { useResource } from '../lib/useResource.js'
import { initials, relativeTime } from '../lib/format.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'

/**
 * The agent pool, as the runner last reported it.
 *
 * Read-only on purpose: agents are Hermes profiles discovered on the runner's
 * machine, not records anyone creates here. Editing one in the dashboard would
 * be overwritten by the next inventory push.
 */
export function Agents(): ReactNode {
  const agents = useResource((key, signal) => api.agents(key, signal), [], { pollMs: 60_000 })

  return (
    <>
      <PageHeader title="Agents" parent={{ label: 'Overview', to: '/' }} />
      <Panel caption="Hermes profiles the runner has discovered">
        {agents.loading ? (
          <Loading label="Loading agents" />
        ) : agents.error ? (
          <ErrorPanel message={agents.error} onRetry={agents.reload} />
        ) : (agents.data ?? []).length === 0 ? (
          <EmptyState title="No agents reported">
            The runner pushes its Hermes profiles when it starts. If this stays empty, check that
            the runner is running and that <code>parallax agents</code> lists something locally.
          </EmptyState>
        ) : (
          <div className="px-tablewrap">
            <table className="px-table">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Model</th>
                  <th scope="col">GitHub</th>
                  <th scope="col">Runner</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {(agents.data ?? []).map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <span className="px-agentcell">
                        <Avatar
                          name={agent.display_name ?? agent.profile}
                          initials={initials(agent.profile)}
                          src={agent.avatar_url ?? undefined}
                          alt={agent.avatar_url ? `${agent.profile} avatar` : undefined}
                          size="sm"
                        />
                        <span className="px-cell">
                          <span className="px-cell__primary">
                            {agent.display_name ?? agent.profile}
                          </span>
                          <span className="px-cell__secondary">{agent.role ?? agent.profile}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="px-cell">
                        <span className="px-cell__primary">{agent.model ?? '—'}</span>
                        <span className="px-cell__secondary">{agent.provider ?? 'hermes'}</span>
                      </span>
                    </td>
                    <td>
                      <Text size="small" tone={agent.github_login ? 'soft' : 'faint'}>
                        {agent.github_login ?? 'not set'}
                      </Text>
                    </td>
                    <td>
                      <span className="px-cell">
                        <span className="px-cell__primary">{agent.runner}</span>
                        <span className="px-cell__secondary">
                          synced {relativeTime(agent.synced_at)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <Badge tone={agent.enabled ? 'success' : 'neutral'}>
                        {agent.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
