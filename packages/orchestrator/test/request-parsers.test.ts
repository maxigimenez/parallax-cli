import { describe, it, expect } from 'vitest'
import {
  parseRetryMode,
  parseNonNegativeInteger,
  parsePositiveInteger,
  parseOptionalTaskId,
} from '../src/runtime/api/request-parsers.js'

describe('parseRetryMode', () => {
  it('defaults to full when undefined', () => {
    expect(parseRetryMode(undefined)).toBe('full')
  })

  it('accepts full', () => {
    expect(parseRetryMode('full')).toBe('full')
  })

  it('accepts execution', () => {
    expect(parseRetryMode('execution')).toBe('execution')
  })

  it('throws for unknown mode', () => {
    expect(() => parseRetryMode('partial')).toThrow("Invalid retry mode 'partial'")
  })

  it('throws for empty string', () => {
    expect(() => parseRetryMode('')).toThrow()
  })
})

describe('parseNonNegativeInteger', () => {
  it('returns defaultValue when undefined', () => {
    expect(parseNonNegativeInteger(undefined, 'since', 0)).toBe(0)
    expect(parseNonNegativeInteger(undefined, 'since', 42)).toBe(42)
  })

  it('parses valid non-negative integers', () => {
    expect(parseNonNegativeInteger('0', 'since', 0)).toBe(0)
    expect(parseNonNegativeInteger('100', 'since', 0)).toBe(100)
  })

  it('throws for negative values', () => {
    expect(() => parseNonNegativeInteger('-1', 'since', 0)).toThrow('since must be a non-negative integer')
  })

  it('throws for non-numeric strings', () => {
    expect(() => parseNonNegativeInteger('abc', 'since', 0)).toThrow()
  })

  it('accepts float strings by truncating to integer', () => {
    // parseInt('1.5', 10) === 1, which is valid — this is documented behavior
    expect(parseNonNegativeInteger('1.5', 'limit', 0)).toBe(1)
  })
})

describe('parsePositiveInteger', () => {
  it('returns defaultValue when undefined', () => {
    expect(parsePositiveInteger(undefined, 'limit', 200)).toBe(200)
  })

  it('parses valid positive integers', () => {
    expect(parsePositiveInteger('1', 'limit', 200)).toBe(1)
    expect(parsePositiveInteger('500', 'limit', 200)).toBe(500)
  })

  it('throws for zero', () => {
    expect(() => parsePositiveInteger('0', 'limit', 200)).toThrow('limit must be a positive integer')
  })

  it('throws for negative values', () => {
    expect(() => parsePositiveInteger('-5', 'limit', 200)).toThrow()
  })

  it('throws for non-numeric strings', () => {
    expect(() => parsePositiveInteger('xyz', 'limit', 200)).toThrow()
  })
})

describe('parseOptionalTaskId', () => {
  it('returns undefined when undefined', () => {
    expect(parseOptionalTaskId(undefined)).toBeUndefined()
  })

  it('returns trimmed string for valid id', () => {
    expect(parseOptionalTaskId('abc-123')).toBe('abc-123')
    expect(parseOptionalTaskId('  abc-123  ')).toBe('abc-123')
  })

  it('throws for empty string', () => {
    expect(() => parseOptionalTaskId('')).toThrow('taskId must be a non-empty string')
  })

  it('throws for whitespace-only string', () => {
    expect(() => parseOptionalTaskId('   ')).toThrow('taskId must be a non-empty string')
  })
})
