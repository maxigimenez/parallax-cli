import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The package root. `import.meta.url` is not a file: URL under happy-dom, and
// vitest runs with the package as its working directory.
const ROOT = process.cwd()
const APP_CSS = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')
const LIB_CSS = readFileSync(join(ROOT, 'node_modules/@16-bits-design/ui/dist/styles.css'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      return sourceFiles(path)
    }
    return path.endsWith('.tsx') ? [path] : []
  })
}

/** The bare elements the library styles as `.bits-theme <el>`. */
function libraryStyledElements(): Set<string> {
  return new Set(
    [...LIB_CSS.matchAll(/\.bits-theme\s+([a-z][a-z0-9]*)\b/g)].map((match) => match[1])
  )
}

/**
 * Selectors where `className` is the leftmost compound, and so is not scoped
 * by an ancestor.
 *
 * Checking merely that *some* `.px-root .foo` rule exists is not enough: the
 * base rule can be unscoped while a `:hover` variant is scoped, and the base is
 * the one that loses to the library.
 */
function unscopedSelectorsFor(className: string): string[] {
  const found: string[] = []
  for (const match of APP_CSS.matchAll(/([^{}]+)\{/g)) {
    for (const selector of match[1].split(',')) {
      const trimmed = selector.trim()
      if (new RegExp(`^\\.${className}(?![\\w-])`).test(trimmed)) {
        found.push(trimmed)
      }
    }
  }
  return found
}

/**
 * Guards the one mistake that made half this UI render wrong.
 *
 * The library styles bare elements at `.bits-theme a`, `.bits-theme h1` and so
 * on — specificity (0,1,1). An application class on such an element is (0,1,0)
 * and loses silently: no error, no warning, just the library's defaults. Every
 * breadcrumb and idle sidebar link rendered primary orange instead of muted
 * grey, and section headings rendered as 24px display type, for exactly this
 * reason.
 *
 * Nothing in TypeScript, ESLint or the build can catch it, and it survives a
 * screenshot unless you already know to look. So it is asserted here: any
 * `px-` class placed on an element the library styles must have at least one
 * rule scoped under `.px-root`, which takes it to (0,2,0).
 */
describe('style specificity against the library', () => {
  const elements = libraryStyledElements()

  it('knows which elements the library styles', () => {
    // If this shrinks to nothing the regex has drifted and the test below
    // would pass vacuously.
    expect(elements.size).toBeGreaterThan(5)
    expect(elements).toContain('a')
    expect(elements).toContain('h1')
  })

  it('scopes every app class that lands on one of those elements', () => {
    // `Link` and `NavLink` render an <a>, so they carry the same hazard.
    const asAnchor = new Set(['Link', 'NavLink'])
    const offenders: string[] = []

    for (const file of sourceFiles(join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(
        /<([A-Za-z][A-Za-z0-9]*)\b[^>]*?className="(px-[a-z0-9_-]+)"/gs
      )) {
        const [, tag, className] = match
        const element = asAnchor.has(tag) ? 'a' : tag
        if (!elements.has(element)) {
          continue
        }
        for (const selector of unscopedSelectorsFor(className)) {
          offenders.push(`${selector} — on <${tag}> in ${file.slice(ROOT.length)}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
