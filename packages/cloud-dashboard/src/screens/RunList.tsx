import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@16-bits-design/ui/button'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useResource } from '../lib/useResource.js'
import { EmptyState } from '@16-bits-design/ui/empty-state'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Spinner } from '@16-bits-design/ui/spinner'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { RunPromptDialog } from '../components/RunPromptDialog.js'
import { RunTable } from '../components/RunTable.js'
import { Segmented } from '@16-bits-design/ui/segmented'
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
  const [running, setRunning] = useState(false)
  const { toast } = useToast()
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
          <>
            <Button
              variant="secondary"
              onClick={runs.reload}
              loading={runs.refreshing}
              loadingLabel="syncing"
            >
              sync now
            </Button>
            <Button onClick={() => setRunning(true)}>run agent</Button>
          </>
        }
      />
      <Panel
        caption={
          <>
            <Segmented
              label="Filter runs by status"
              value={filter}
              onValueChange={(next) => setFilter(next as Filter)}
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
          <Spinner label="Loading runs" />
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

      <RunPromptDialog
        open={running}
        onClose={() => setRunning(false)}
        onQueued={(runner) => {
          toast({
            tone: 'success',
            title: 'Run queued',
            message: `${runner} will start it on its next poll, within about 30 seconds.`,
          })
          // The runner has to fetch the command before the run exists, so the
          // usual 15-second poll would show an empty list for a moment and read
          // as nothing having happened. Reloading now costs one request.
          runs.reload()
        }}
      />
    </>
  )
}
