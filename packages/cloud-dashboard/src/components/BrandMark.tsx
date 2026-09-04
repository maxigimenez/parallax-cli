import type { ReactNode } from 'react'

/**
 * The sentinel0 mark, drawn from theme tokens.
 *
 * Inline rather than `<img src="/brand/sentinel0-icon.svg">` because that file
 * carries the brand's own fixed palette — under a theme that moved the accent
 * it would stay put, and read as an asset somebody forgot to update rather than
 * a brand. An `<img>` cannot see the page's custom properties, whatever the SVG
 * says, so following the theme means drawing it here.
 *
 * The shape is the brand file's, rect for rect; only the fills are roles. The
 * one departure is the core, which the brand file bevels with a lighter cap and
 * the app design leaves flat: at the 34px this is ever drawn at, that cap is
 * two pixels, and the design chose not to spend them.
 *
 * `public/brand/sentinel0-icon.svg` stays for the favicon, which is outside the
 * document and cannot read a variable either way.
 */
export function BrandMark({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 1024 1024"
      shapeRendering="crispEdges"
      role="img"
      aria-label="sentinel0"
    >
      <rect x="0" y="0" width="1024" height="1024" fill="var(--bits-ink)" />
      <rect x="64" y="64" width="896" height="896" fill="var(--bits-primary)" />
      {/* The offset shadow and highlight that give the square its pixel bevel. */}
      <rect x="64" y="896" width="896" height="64" fill="var(--bits-primary-shadow)" />
      <rect x="896" y="64" width="64" height="896" fill="var(--bits-primary-shadow)" />
      <rect x="64" y="64" width="896" height="64" fill="var(--bits-primary-soft)" />
      <rect x="64" y="64" width="64" height="896" fill="var(--bits-primary-soft)" />
      {/* The slot, with its corners notched back out so it reads as an aperture. */}
      <rect x="320" y="256" width="384" height="512" fill="var(--bits-ink)" />
      <rect x="320" y="256" width="64" height="64" fill="var(--bits-primary)" />
      <rect x="640" y="256" width="64" height="64" fill="var(--bits-primary)" />
      <rect x="320" y="704" width="64" height="64" fill="var(--bits-primary)" />
      <rect x="640" y="704" width="64" height="64" fill="var(--bits-primary)" />
      {/* The core. The only warm thing in the mark, as it is in the theme. */}
      <rect x="448" y="384" width="128" height="256" fill="var(--bits-danger)" />
    </svg>
  )
}
