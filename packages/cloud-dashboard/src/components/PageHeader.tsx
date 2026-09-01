import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The title row: where you are, how you got here, and what you can do.
 *
 * The heading is the page's only h1. The blinking block after it is the
 * design's terminal caret — decorative, and hidden from assistive tech.
 */
export function PageHeader({
  title,
  parent,
  actions,
}: {
  title: string
  parent?: { label: string; to: string }
  actions?: ReactNode
}): ReactNode {
  return (
    <div className="px-topbar">
      <div className="px-crumbs">
        {parent ? (
          <>
            <Link to={parent.to} className="px-crumbs__link">
              {parent.label}
            </Link>
            <span className="px-crumbs__sep" aria-hidden="true" />
          </>
        ) : null}
        <h1 className="px-crumbs__here">{title}</h1>
        <span className="px-caret" aria-hidden="true" />
      </div>
      {actions ? <div className="px-topbar__actions">{actions}</div> : null}
    </div>
  )
}
