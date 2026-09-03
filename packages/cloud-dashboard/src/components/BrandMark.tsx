import type { ReactNode } from 'react'

/**
 * The Parallax mark, drawn from theme tokens.
 *
 * Inline rather than `<img src="/brand/parallax-icon.svg">` because that file
 * hardcodes ember's palette — it is not a fixed logo so much as the accent
 * colour rendered as an image. Under any other theme it stayed orange, which on
 * a purple UI reads as an asset somebody forgot to update rather than a brand.
 *
 * An `<img>` cannot see the page's custom properties, whatever the SVG says, so
 * following the theme means drawing it here. The shape is the file's, rect for
 * rect; only the fills are now roles.
 *
 * `public/brand/parallax-icon.svg` stays for the favicon, which is outside the
 * document and cannot read a variable either way.
 */
export function BrandMark({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 1024 1024"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Parallax"
    >
      <rect x="0" y="0" width="1024" height="1024" fill="var(--bits-ink)" />
      <rect x="64" y="64" width="896" height="896" fill="var(--bits-primary)" />
      {/* The offset shadow and highlight that give the square its pixel bevel. */}
      <rect x="64" y="896" width="896" height="64" fill="var(--bits-primary-shadow)" />
      <rect x="896" y="64" width="64" height="896" fill="var(--bits-primary-shadow)" />
      <rect x="64" y="64" width="896" height="64" fill="var(--bits-primary-soft)" />
      <rect x="64" y="64" width="64" height="896" fill="var(--bits-primary-soft)" />
      <rect x="256" y="640" width="512" height="96" fill="var(--bits-ink)" />
    </svg>
  )
}
