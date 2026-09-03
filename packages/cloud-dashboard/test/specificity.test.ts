import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The package root. `import.meta.url` is not a file: URL under happy-dom, and
// vitest runs with the package as its working directory.
const ROOT = process.cwd()
const LIB_CSS = readFileSync(join(ROOT, 'node_modules/@16-bits-design/ui/dist/styles.css'), 'utf8')

/**
 * Guards the one mistake that made half this UI render wrong.
 *
 * The library styles bare elements — `a`, `h1`–`h6`, `p`, `code` and more —
 * under its theme scope. At 0.1.0 it did so as `.bits-theme a`, specificity
 * (0,1,1), which silently out-specified any single application class on the
 * same element: no error, no warning, just the library's defaults. Every
 * breadcrumb and idle sidebar link rendered primary orange instead of muted
 * grey, and every section heading rendered as 24px display type.
 *
 * 0.2.0 wraps those selectors in `:where()`, which zeroes their specificity
 * and lets one app class win. `src/styles.css` now relies on that: the
 * `.px-root` doubling that used to work around it is gone.
 *
 * So the assertion is inverted from what it used to be. It no longer checks
 * that the app doubles up its selectors — it checks that the library still
 * makes doubling unnecessary. A regression would be as invisible as the
 * original bug, and nothing in TypeScript, ESLint or the build would catch it.
 */
describe('the library keeps its element defaults specificity-free', () => {
  /** Every `.bits-theme <selector>` rule, with the part after the theme class. */
  function themeScopedSelectors(): string[] {
    return [...LIB_CSS.matchAll(/\.bits-theme\s+([^,{]+)/g)].map((match) => match[1].trim())
  }

  it('finds the theme-scoped element rules at all', () => {
    // If this drifts to nothing the regex no longer matches the stylesheet and
    // the assertion below would pass vacuously.
    expect(themeScopedSelectors().length).toBeGreaterThan(5)
  })

  it('wraps every bare element default in :where()', () => {
    // A selector naming an element — `a`, `h1`, `code` — rather than a class.
    const bare = themeScopedSelectors().filter((selector) => /^[a-z]/.test(selector))

    expect(bare, 'a bare element selector outside :where() out-specifies app classes').toEqual([])
  })

  it('still styles the elements the app overrides', () => {
    // The rules are meant to exist — just without specificity. If they vanish,
    // the app's overrides are overriding nothing and the reasoning above is
    // stale.
    for (const element of ['a', 'h1', 'p', 'code']) {
      expect(LIB_CSS, `no default for <${element}>`).toContain(`.bits-theme :where(${element})`)
    }
  })
})
