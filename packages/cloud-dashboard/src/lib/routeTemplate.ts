import type { RouteTemplate, RoutingRule } from '../api/types.js'

/**
 * Substitutes a template's `<PLACEHOLDER>` tokens.
 *
 * This mirrors `fillRouteTemplate` in `@sentinel0/common` rather than importing
 * it: that module is part of the runner's type spine and pulls Node-only
 * declarations into a DOM build. The contract it implements is one line of
 * string replacement over the serialized route, and the test alongside this
 * file pins it to the same behaviour — including leaving an unfilled token
 * visible rather than blanking it, so the API rejects an incomplete route
 * instead of silently storing one that can never match.
 */
export function fillRouteTemplate(
  template: RouteTemplate,
  values: Record<string, string>
): Omit<RoutingRule, 'id'> {
  const serialized = JSON.stringify(template.route)
  const filled = serialized.replace(/<[A-Z_]+>/g, (token) => {
    const value = values[token]?.trim()
    if (!value) {
      return token
    }
    // The substitution happens inside a JSON string literal, so the value has
    // to be escaped the way JSON would escape it — minus the quotes the
    // literal already has. A project id or prompt containing a quote or a
    // backslash would otherwise produce a document that no longer parses.
    return JSON.stringify(value).slice(1, -1)
  })
  return JSON.parse(filled) as Omit<RoutingRule, 'id'>
}

/** The tokens a template still needs, so the form can block submission. */
export function missingPlaceholders(
  template: RouteTemplate,
  values: Record<string, string>
): string[] {
  return template.placeholders
    .filter((placeholder) => !values[placeholder.token]?.trim())
    .map((placeholder) => placeholder.token)
}
