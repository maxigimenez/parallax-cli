import { describe, expect, it } from 'vitest'
import { createTaskId } from '../src/task-id'

describe('createTaskId', () => {
  it('returns a deterministic hash id', () => {
    const id = createTaskId('core', 'ENG-123')
    expect(id).toBe('903440922f42')
  })

  it('returns the same id for the same project and external id', () => {
    expect(createTaskId('core', 'ENG-123')).toBe(createTaskId('core', 'ENG-123'))
  })

  it('returns different ids across projects', () => {
    expect(createTaskId('core', 'ENG-123')).not.toBe(createTaskId('ops', 'ENG-123'))
  })

  it('returns a fixed-length hex id', () => {
    expect(createTaskId('core', 'ENG-123')).toMatch(/^[a-f0-9]{12}$/)
  })
})
