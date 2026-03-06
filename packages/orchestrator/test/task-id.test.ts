import { describe, expect, it } from 'vitest'
import { createTaskId } from '../src/task-id'

describe('createTaskId', () => {
  it('returns a compact 12-char hex id', () => {
    const id = createTaskId()
    expect(id).toMatch(/^[a-f0-9]{12}$/)
  })

  it('returns unique ids across quick calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createTaskId()))
    expect(ids.size).toBe(100)
  })
})
