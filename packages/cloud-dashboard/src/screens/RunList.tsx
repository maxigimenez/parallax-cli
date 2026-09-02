import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@16-bits-design/ui/button'
import { api } from '../api/endpoints.js'
import { useResource } from '../lib/useResource.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { RunTable } from '../components/RunTable.js'
import { Segmented } from '../components/Segmented.js'
import type { RunStatus } from '../api/types.js'

type Filter = 'all' | 'active' | 'failed' | 'completed'

const MATCHES: Record<Filter, (status: RunStatus) => boolean> = {
  all: () => true,
  active: (status) => status === 'running' || status === 'queued' || status === 'awaiting_approval',
  failed: (status) => status === 'failed',
  completed: (status) => status === 'completed',
}

/**
 * Filtering happens in the browser, not through the API's `status` parameter.
 *
 * The list is capped at 200 server-side and "active" spans three statuses the
 * API can only filter one at a time, so a round trip per tab would fetch three
 * overlapping pages to answer a question one already-loaded page answers.
 */
export function RunList(): ReactNode {
  const [filter, setFilter] = useState<Filter>('all')
  const runs = useResource((key, signal) => api.runs(key, { limit: 200 }, signal), [], {
    pollMs: 15_000,
  })

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const visible = useMemo(
    () => (runs.data ?? []).filter((run) => MATCHES[filter](run.status)),
    [runs.data, filter]
  )

  return (
    <>
      <PageHeader
        title="Runs"
        parent={{ label: 'Overview', to: '/' }}
        actions={
          <Button
            variant="secondary"
            onClick={runs.reload}
            loading={runs.refreshing}
            loadingLabel="syncing"
          >
            sync now
          </Button>
        }
      />
      <Panel
        caption={
          <>
            <Segmented
              label="Filter runs by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'all' },
                { value: 'active', label: 'in progress' },
                { value: 'failed', label: 'failed' },
                { value: 'completed', label: 'completed' },
              ]}
            />
          </>
        }
      >
        {runs.loading ? (
          <Loading label="Loading runs" />
        ) : runs.error ? (
          <ErrorPanel message={runs.error} onRetry={runs.reload} />
        ) : visible.length === 0 ? (
          <EmptyState title={filter === 'all' ? 'No runs yet' : `No ${filter} runs`}>
            {filter === 'all'
              ? 'A run appears here once a route matches a ticket or pull request. Check that a route is enabled and a project is registered.'
              : 'Nothing matches this filter right now. Other runs may exist under a different one.'}
          </EmptyState>
        ) : (
          <RunTable runs={visible} now={now} />
        )}
      </Panel>
    </>
  )
}
