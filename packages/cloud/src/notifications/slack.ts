import type { RunRecord } from '@parallax/common'
import type { Database } from '../db.js'

export type NotificationEvent =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.needs_approval'
  | 'run.canceled'
  | 'runner.stale'

const ICONS: Record<NotificationEvent, string> = {
  'run.started': ':hourglass_flowing_sand:',
  'run.completed': ':white_check_mark:',
  'run.failed': ':x:',
  'run.needs_approval': ':raising_hand:',
  'run.canceled': ':black_square_for_stop:',
  'runner.stale': ':warning:',
}

function duration(run: RunRecord): string | undefined {
  if (!run.startedAt || !run.endedAt) {
    return undefined
  }
  const seconds = Math.round((run.endedAt - run.startedAt) / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/**
 * The message a human reads to know what the agents are doing.
 *
 * Leads with the agent and what triggered it, because that is the question
 * someone glancing at the channel is actually asking.
 */
export function buildSlackMessage(
  event: NotificationEvent,
  run: RunRecord
): Record<string, unknown> {
  const took = duration(run)
  const lines = [
    `${ICONS[event]} *${run.agentProfile}* ${verb(event)} — ${run.title}`,
    [
      run.triggerUrl ? `<${run.triggerUrl}|${run.triggerRef}>` : run.triggerRef,
      run.routeName ? `via _${run.routeName}_` : undefined,
      took ? `in ${took}` : undefined,
    ]
      .filter(Boolean)
      .join('  ·  '),
  ]

  const detail = event === 'run.failed' ? run.error : run.summary
  if (detail) {
    // Slack renders long blocks badly; the run detail page has the full text.
    lines.push('', detail.length > 600 ? `${detail.slice(0, 600)}…` : detail)
  }

  return { text: lines.join('\n'), mrkdwn: true }
}

function verb(event: NotificationEvent): string {
  switch (event) {
    case 'run.started':
      return 'started'
    case 'run.completed':
      return 'finished'
    case 'run.failed':
      return 'failed'
    case 'run.needs_approval':
      return 'needs approval'
    case 'run.canceled':
      return 'was canceled'
    case 'runner.stale':
      return 'went offline'
  }
}

interface SlackConfigRow {
  webhook_url: string
  events: string[]
  enabled: boolean
}

/**
 * Posts one run lifecycle event to the org's Slack webhook.
 *
 * Never throws: notification is a side channel, and a Slack outage must not
 * fail the runner's mirror write. The `(run_id, event)` unique constraint on
 * `notification_deliveries` is what makes this safe to call more than once for
 * the same transition -- a duplicate insert loses the race and does not post.
 */
export async function notifyRunEvent(
  db: Database,
  orgId: string,
  run: RunRecord,
  event: string
): Promise<void> {
  try {
    const { rows } = await db.query<SlackConfigRow>(
      'SELECT webhook_url, events, enabled FROM slack_integrations WHERE org_id = $1',
      [orgId]
    )
    const config = rows[0]
    if (!config?.enabled || !config.events.includes(event)) {
      return
    }

    const claimed = await db.query(
      `INSERT INTO notification_deliveries (org_id, run_id, event, status, attempts)
       VALUES ($1,$2,$3,'pending',1)
       ON CONFLICT (run_id, event) DO NOTHING
       RETURNING id`,
      [orgId, run.id, event]
    )
    if (claimed.rowCount === 0) {
      return
    }

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildSlackMessage(event as NotificationEvent, run)),
      signal: AbortSignal.timeout(10_000),
    })

    await db.query(
      'UPDATE notification_deliveries SET status = $3, last_error = $4 WHERE run_id = $1 AND event = $2',
      [
        run.id,
        event,
        response.ok ? 'delivered' : 'failed',
        response.ok ? null : `HTTP ${response.status}`,
      ]
    )
  } catch (error: unknown) {
    await db
      .query(
        'UPDATE notification_deliveries SET status = $3, last_error = $4 WHERE run_id = $1 AND event = $2',
        [run.id, event, 'failed', error instanceof Error ? error.message : String(error)]
      )
      .catch(() => undefined)
  }
}
