import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Button } from '@16-bits-design/ui/button'
import { Text } from '@16-bits-design/ui/typography'
import { useSession } from '../lib/session.js'
import { relativeTime } from '../lib/format.js'
import type { Runner } from '../api/types.js'

interface NavEntry {
  to: string
  label: string
  count?: number
}

const GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: 'workspace',
    items: [
      { to: '/', label: 'Overview' },
      { to: '/runs', label: 'Runs' },
      { to: '/routes', label: 'Routes' },
      { to: '/agents', label: 'Agents' },
    ],
  },
  {
    label: 'organization',
    items: [
      { to: '/projects', label: 'Projects' },
      { to: '/keys', label: 'Access keys' },
      { to: '/settings', label: 'Settings' },
    ],
  },
]

/**
 * Reports the runner the way an operator actually asks about it: is anything
 * out there, and did it check in recently. Multiple runners collapse to a count
 * because one org has one Mac Mini in practice, and a list of one is noise.
 */
function RunnerLine({ runners }: { runners: Runner[] | undefined }): ReactNode {
  if (!runners) {
    return (
      <span className="px-runnerline">
        <span className="px-runnerline__dot px-runnerline__dot--none" aria-hidden="true" />
        <span className="px-runnerline__text">checking runner…</span>
      </span>
    )
  }
  if (runners.length === 0) {
    return (
      <span className="px-runnerline">
        <span className="px-runnerline__dot px-runnerline__dot--none" aria-hidden="true" />
        <span className="px-runnerline__text">no runner registered</span>
      </span>
    )
  }
  const live = runners.filter((runner) => !runner.stale)
  const primary = live[0] ?? runners[0]
  const stale = live.length === 0
  return (
    <span className="px-runnerline" title={primary.hostname ?? primary.name}>
      <span
        className={`px-runnerline__dot${stale ? ' px-runnerline__dot--stale' : ''}`}
        aria-hidden="true"
      />
      <span className="px-runnerline__text">
        {stale
          ? `${primary.name} · last seen ${relativeTime(primary.last_seen_at)}`
          : `${primary.name}${runners.length > 1 ? ` +${runners.length - 1}` : ''} · live`}
      </span>
    </span>
  )
}

export function Sidebar({
  runners,
  counts,
}: {
  runners: Runner[] | undefined
  counts: Record<string, number | undefined>
}): ReactNode {
  const { session, signOut } = useSession()

  return (
    <nav className="px-sidebar" aria-label="Primary">
      <div className="px-sidebar__brand">
        <img
          src="/brand/parallax-icon.svg"
          alt=""
          className="px-sidebar__mark"
          aria-hidden="true"
        />
        <span className="px-sidebar__org">
          <img src="/brand/parallax-wordmark.svg" alt="Parallax" className="px-sidebar__wordmark" />
          <Text size="caption" tone="muted">
            {session?.me.org.name ?? '—'}
          </Text>
        </span>
      </div>

      <div className="px-sidebar__nav">
        {GROUPS.map((group) => (
          <div className="px-navgroup" key={group.label}>
            <span className="px-navgroup__label">{group.label}</span>
            <div className="px-navgroup__items">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className="px-navitem"
                  // NavLink sets aria-current itself; the class hook reads it,
                  // so active styling and the announced state cannot diverge.
                >
                  <span className="px-navitem__dot" aria-hidden="true" />
                  <span className="px-navitem__label">{item.label}</span>
                  {counts[item.label] === undefined ? null : (
                    <span className="px-navitem__count">{counts[item.label]}</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-sidebar__foot">
        <RunnerLine runners={runners} />
        <div className="px-runnerline" style={{ justifyContent: 'space-between' }}>
          <span className="px-runnerline__text">{session?.me.key.prefix ?? 'key'}…</span>
          <Button size="sm" variant="ghost" onClick={signOut}>
            sign out
          </Button>
        </div>
      </div>
    </nav>
  )
}
