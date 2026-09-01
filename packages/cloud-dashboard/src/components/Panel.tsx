import type { ReactNode } from 'react'

/** The bordered frame every screen renders inside, with its one-line caption. */
export function Panel({
  caption,
  children,
}: {
  caption: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <div className="px-panel">
      <div className="px-panel__caption">{caption}</div>
      {children}
    </div>
  )
}

export function Section({
  title,
  actions,
  children,
  padded = true,
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Off for a section whose body is a table, which brings its own padding. */
  padded?: boolean
}): ReactNode {
  return (
    <section className="px-section">
      <div className="px-section__head">
        <h2 className="px-section__title">{title}</h2>
        {actions}
      </div>
      {padded ? <div className="px-section__body">{children}</div> : children}
    </section>
  )
}
