import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@16-bits-design/ui/button'
import { useToast } from '@16-bits-design/ui/toast'
import { api } from '../api/endpoints.js'
import { useKey } from '../lib/session.js'
import { useResource } from '../lib/useResource.js'
import { Alert } from '../components/Alert.js'
import { EmptyState } from '../components/EmptyState.js'
import { ErrorPanel } from '../components/ErrorPanel.js'
import { Loading } from '../components/Loading.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel, Section } from '../components/Panel.js'
import { RunTable } from '../components/RunTable.js'
import { StatTile } from '../components/StatTile.js'
import type { RunStatus } from '../api/types.js'

const ACTIVE: RunStatus[] = ['running', 'queued', 'awaiting_approval']

export function Overview(): ReactNode {
  const key = useKey()
  const { toast } = useToast()
  const runs = useResource((k, signal) => api.runs(k, { limit: 100 }, signal), [], {
    pollMs: 15_000,
  })

  // Elapsed times are derived from `now`, so a running row has to be re-rendered
  // on a clock of its own — the run data itself has not changed.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const all = runs.data ?? []
  const count = (status: RunStatus): number => all.filter((run) => run.status === status).length
  const active = all.filter((run) => ACTIVE.includes(run.status))

  const resync = async (): Promise<void> => {
    try {
      await api.resync(key)
      toast({
        tone: 'info',
        title: 'Resync queued',
        message: 'The runner will pick it up on its next poll, within about 25 seconds.',
      })
    } catch (error) {
      toast({
        tone: 'danger',
        title: 'Could not queue a resync',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <>
      <PageHeader
        title="Overview"
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
            <Button onClick={() => void resync()}>resync runner</Button>
          </>
        }
      />
      <Panel caption="What your agents are doing right now">
        {runs.loading ? (
          <Loading label="Loading runs" />
        ) : runs.error ? (
          <ErrorPanel message={runs.error} onRetry={runs.reload} />
        ) : (
          <div className="px-panel__body">
            <div className="px-stats">
              <StatTile
                label="running"
                value={count('running')}
                total={all.length}
                tone="primary"
                note={count('running') === 1 ? '1 agent busy' : `${count('running')} agents busy`}
              />
              <StatTile
                label="queued"
                value={count('queued') + count('awaiting_approval')}
                total={all.length}
                tone="amber"
                note={
                  count('awaiting_approval') > 0 ? 'some await approval' : 'waiting for an agent'
                }
              />
              <StatTile
                label="failed"
                value={count('failed')}
                total={all.length}
                tone="danger"
                note="in the last 100 runs"
              />
              <StatTile
                label="completed"
                value={count('completed')}
                total={all.length}
                tone="success"
                note="in the last 100 runs"
              />
            </div>

            {count('failed') > 0 ? (
              <Alert tone="warning" title="Some runs failed">
                A failed run keeps its <code>parallax:failed</code> label, which stops its route
                firing again. Remove the label on the ticket or pull request to re-arm it.
              </Alert>
            ) : null}

            <Section
              title="Active work"
              padded={false}
              actions={
                <Link to="/runs" style={{ fontSize: 'var(--bits-font-size-caption)' }}>
                  all runs →
                </Link>
              }
            >
              {active.length === 0 ? (
                <EmptyState title="Nothing running">
                  {all.length === 0
                    ? 'No runs recorded yet. A run appears here once a route matches a ticket or pull request.'
                    : 'Every run has finished. Recent ones are on the runs screen.'}
                </EmptyState>
              ) : (
                <RunTable runs={active} now={now} />
              )}
            </Section>
          </div>
        )}
      </Panel>
    </>
  )
}
