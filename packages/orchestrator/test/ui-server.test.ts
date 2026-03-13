import { describe, it, expect } from 'vitest'
import path from 'node:path'

/**
 * Tests for the path traversal prevention logic in the UI server.
 * We test the resolution logic directly rather than spinning up the server.
 */
function resolveAndValidate(uiDistPath: string, requestPath: string): { ok: boolean; resolved?: string } {
  const normalized = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath
  const decoded = decodeURIComponent(normalized)
  const uiRootResolved = path.resolve(uiDistPath)
  const resolved = path.resolve(uiRootResolved, decoded || 'index.html')
  const relative = path.relative(uiRootResolved, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false }
  }

  return { ok: true, resolved }
}

describe('UI server path traversal prevention', () => {
  const uiDist = '/app/ui/dist'

  it('allows normal asset path', () => {
    const result = resolveAndValidate(uiDist, 'assets/index.js')
    expect(result.ok).toBe(true)
    expect(result.resolved).toBe('/app/ui/dist/assets/index.js')
  })

  it('allows empty path (falls back to index.html)', () => {
    const result = resolveAndValidate(uiDist, '')
    expect(result.ok).toBe(true)
    expect(result.resolved).toBe('/app/ui/dist/index.html')
  })

  it('blocks simple path traversal', () => {
    const result = resolveAndValidate(uiDist, '../etc/passwd')
    expect(result.ok).toBe(false)
  })

  it('blocks URL-encoded path traversal', () => {
    // Single encoding: ..%2fetc%2fpasswd
    const result = resolveAndValidate(uiDist, '..%2fetc%2fpasswd')
    expect(result.ok).toBe(false)
  })

  it('blocks double URL-encoded path traversal', () => {
    // Double encoding: ..%252fetc%252fpasswd — Fastify decodes once (%25 -> %),
    // then decodeURIComponent decodes again (%2f -> /)
    const result = resolveAndValidate(uiDist, '..%252fetc%252fpasswd')
    expect(result.ok).toBe(false)
  })

  it('blocks traversal with mixed slashes', () => {
    const result = resolveAndValidate(uiDist, '../../etc/passwd')
    expect(result.ok).toBe(false)
  })

  it('blocks sibling-directory false positive (startsWith boundary)', () => {
    // /app/ui/distEvil would pass a naive startsWith('/app/ui/dist') check
    const result = resolveAndValidate('/app/ui/dist', '../distEvil/secret')
    expect(result.ok).toBe(false)
  })

  it('allows nested asset paths', () => {
    const result = resolveAndValidate(uiDist, 'assets/fonts/roboto.woff2')
    expect(result.ok).toBe(true)
    expect(result.resolved).toBe('/app/ui/dist/assets/fonts/roboto.woff2')
  })
})
