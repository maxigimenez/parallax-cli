import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BrandMark } from './BrandMark.js'
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
 * out there, did it check in recently, and is it able to reach Hermes.
 *
 * Multiple runners collapse to a count because one org has one machine in
 * practice, and a list of one is noise. The full picture is on Settings.
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

  // Three states, not two. A runner that is checking in but cannot reach Hermes
  // will never start anything, and reporting that as healthy would be a lie of
  // exactly the kind this indicator exists to prevent.
  const degraded = !stale && primary.hermes_ok === false
  const modifier = stale
    ? ' px-runnerline__dot--stale'
    : degraded
      ? ' px-runnerline__dot--warn'
      : ''

  const detail = stale
    ? `last seen ${relativeTime(primary.last_seen_at)}`
    : degraded
      ? 'hermes unreachable'
      : primary.active_runs
        ? `${primary.active_runs} running`
        : 'live'

  return (
    <span
      className="px-runnerline"
      title={[primary.hostname, primary.hermes_detail].filter(Boolean).join(' · ')}
    >
      <span className={`px-runnerline__dot${modifier}`} aria-hidden="true" />
      <span className="px-runnerline__text">
        {primary.name}
        {runners.length > 1 ? ` +${runners.length - 1}` : ''} · {detail}
      </span>
    </span>
  )
}

/**
 * The organization, and the one action attached to it.
 *
 * The design puts an org switcher at the top of the sidebar; the product
 * wordmark belongs to the login screen. A key resolves to exactly one
 * organization, so the menu carries that org and signing out, rather than a
 * list that could never have a second entry.
 */
function OrgControl(): ReactNode {
  const { session, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  // Closing on an outside click or Escape is the difference between a menu and
  // a thing that gets stuck open.
  useEffect(() => {
    if (!open) {
      return
    }
    const onPointer = (event: MouseEvent): void => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = session?.me.org.name ?? '—'

  return (
    <div style={{ position: 'relative', flex: 'none' }} ref={wrapper}>
      <button
        type="button"
        className="px-orgbutton"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <BrandMark className="px-sidebar__mark" />
        <span className="px-orgbutton__text">
          <span className="px-orgbutton__name">{name}</span>
          <span className="px-orgbutton__meta">{session?.me.key.name ?? 'organization'}</span>
        </span>
        <span className="px-orgbutton__caret" aria-hidden="true">
          ▼
        </span>
      </button>

      {open ? (
        <div className="px-orgmenu" role="menu">
          <div className="px-orgmenu__row">
            <span className="px-orgmenu__initial" aria-hidden="true">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="px-orgmenu__label">{name}</span>
            <span className="px-orgmenu__check" aria-hidden="true">
              ●
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="px-orgmenu__row px-orgmenu__row--action"
            onClick={signOut}
          >
            sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Sidebar({
  runners,
  counts,
}: {
  runners: Runner[] | undefined
  counts: Record<string, number | undefined>
}): ReactNode {
  return (
    <nav className="px-sidebar" aria-label="Primary">
      <OrgControl />

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
      </div>
    </nav>
  )
}
