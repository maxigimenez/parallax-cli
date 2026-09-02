import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = path.resolve(import.meta.dirname, '../dist/index.js')

/**
 * Imports the compiled package rather than the source.
 *
 * Every other test aliases `@parallax/common` to `src/`, which resolves module
 * cycles differently from the real ESM graph. A circular import that throws a
 * TDZ error on load therefore passes the whole suite and only fails once the
 * container starts. This is the guard against that.
 */
describe('the built package', () => {
  it.skipIf(!existsSync(dist))('imports without a circular-initialization error', async () => {
    const built = (await import(pathToFileURL(dist).href)) as Record<string, unknown>

    expect(Array.isArray(built.ROUTE_CATALOG)).toBe(true)
    expect(Array.isArray(built.PROMPT_CATALOG)).toBe(true)
    expect(typeof built.validateRoutingRule).toBe('function')
    expect(typeof built.isParallaxLabel).toBe('function')
  })

  it.skipIf(!existsSync(dist))(
    'validates a filled catalog route through the built code',
    async () => {
      const built = (await import(pathToFileURL(dist).href)) as {
        ROUTE_CATALOG: Array<{ placeholders: Array<{ token: string }> }>
        fillRouteTemplate: (template: unknown, values: Record<string, string>) => object
        validateRoutingRule: (route: unknown) => string | undefined
      }

      for (const template of built.ROUTE_CATALOG) {
        const values = Object.fromEntries(template.placeholders.map((entry) => [entry.token, 'x']))
        const route = { ...built.fillRouteTemplate(template, values), id: 'rt_x' }
        expect(built.validateRoutingRule(route)).toBeUndefined()
      }
    }
  )
})
