import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@16-bits-design/ui/avatar'
import { Badge } from '@16-bits-design/ui/badge'
import { Text } from '@16-bits-design/ui/typography'
import type { Run } from '../api/types.js'
import { duration, initials, relativeTime, STATUS_TONE } from '../lib/format.js'

/**
 * The run list, shared by the overview and the runs screen.
 *
 * There is deliberately no progress column. The API reports a status and two
 * timestamps, not a percentage, and a bar drawn from a status would be an
 * invented number on the screen people use to decide whether something is
 * stuck. Elapsed time is the honest version, and it is the figure that actually
 * tells you a run has hung.
 */
export function RunTable({ runs, now }: { runs: Run[]; now: number }): ReactNode {
  return (
    <div className="px-tablewrap">
      <table className="px-table">
        <thead>
          <tr>
            <th scope="col">Trigger</th>
            <th scope="col">Agent</th>
            <th scope="col">Route</th>
            <th scope="col">Elapsed</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const profile = run.agent_profile ?? 'unassigned'
            return (
              <tr key={run.id}>
                <td>
                  <Link to={`/runs/${run.id}`} className="px-rowlink">
                    <span className="px-cell">
                      <span className="px-cell__primary">
                        {run.title ?? run.trigger_ref ?? run.id}
                      </span>
                      <span className="px-cell__secondary">
                        {[run.trigger_ref, run.project_id].filter(Boolean).join(' · ') || run.id}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  <span className="px-agentcell">
                    <Avatar name={profile} initials={initials(profile)} size="sm" />
                    <span className="px-cell">
                      <span className="px-cell__primary">{profile}</span>
                      <span className="px-cell__secondary">
                        {run.agent_profile ? 'hermes profile' : 'no agent'}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <Text size="small" tone="soft">
                    {run.route_name ?? '—'}
                  </Text>
                </td>
                <td>
                  <span className="px-cell">
                    <span className="px-cell__secondary" style={{ color: 'var(--bits-text-soft)' }}>
                      {duration(run.started_at, run.ended_at, now)}
                    </span>
                    <span className="px-cell__secondary">{relativeTime(run.updated_at, now)}</span>
                  </span>
                </td>
                <td>
                  <Badge tone={STATUS_TONE[run.status] ?? 'neutral'}>
                    {run.status.replace(/_/g, ' ')}
                  </Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
