import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const THEME_CSS = readFileSync(join(ROOT, 'src/theme-noir.css'), 'utf8')
const APP_TSX = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
const MAIN_TSX = readFileSync(join(ROOT, 'src/main.tsx'), 'utf8')
const LIB_CSS = readFileSync(join(ROOT, 'node_modules/@16-bits-design/ui/dist/styles.css'), 'utf8')

/** The `--bits-*` names one theme selector's block defines. */
function tokensIn(css: string, selector: string): Set<string> {
  const start = css.indexOf(selector)
  if (start === -1) {
    return new Set()
  }
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return new Set([...block.matchAll(/(--bits-[a-z0-9-]+)\s*:/g)].map((match) => match[1]))
}

/**
 * A custom theme fails quietly.
 *
 * `ThemeProvider` takes any name and writes it to `data-bits-theme`; nothing
 * checks that a matching block exists or that it is complete. A token the theme
 * forgets is not an error — it inherits the library's `:root`, which is ember.
 * So a noir missing `--bits-primary-soft` renders one orange hover state in
 * an otherwise neutral UI, and only a person looking at that state finds it.
 */
describe('the noir theme', () => {
  it('is the theme the app actually asks for', () => {
    expect(APP_TSX).toContain('theme="noir"')
    expect(THEME_CSS).toContain("[data-bits-theme='noir']")
  })

  it('loads after the library, so its palette wins', () => {
    expect(MAIN_TSX.indexOf("'@16-bits-design/ui/styles.css'")).toBeLessThan(
      MAIN_TSX.indexOf("'./theme-noir.css'")
    )
  })

  it('redefines every colour a built-in theme does', () => {
    // Ocean is the library's own worked example of a non-default palette, so
    // what it overrides is the set a theme is expected to carry.
    const ocean = tokensIn(LIB_CSS, "[data-bits-theme='ocean']")
    const noir = tokensIn(THEME_CSS, "[data-bits-theme='noir']")

    expect(ocean.size).toBeGreaterThan(10)
    expect([...ocean].filter((token) => !noir.has(token))).toEqual([])
  })

  it('sets --bits-ink, which ocean leaves inherited from ember', () => {
    // Ink is the foreground on a primary fill. Ember's is a warm brown, which
    // is wrong on violet, and inheriting it is exactly the silent failure above.
    expect(tokensIn(THEME_CSS, "[data-bits-theme='noir']")).toContain('--bits-ink')
  })

  it('leaves geometry and type to the library', () => {
    // A theme is a palette. Spacing, borders and fonts are the visual language,
    // and a theme that moved them would stop looking like this system.
    const noir = [...tokensIn(THEME_CSS, "[data-bits-theme='noir']")]
    const structural = noir.filter((token) =>
      /^--bits-(space|font|border-width|focus-ring)/.test(token)
    )
    expect(structural).toEqual([])
  })
})
