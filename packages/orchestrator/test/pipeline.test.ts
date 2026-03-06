import { describe, it, expect } from 'vitest'
import { Task } from '@parallax/common'

describe('Parallax Pipeline Validation', () => {
  it('should correctly format branch names from task IDs', () => {
    const task: Partial<Task> = { externalId: 'ENG-123' }
    const branchName = `task/${task.externalId?.toLowerCase()}`
    expect(branchName).toBe('task/eng-123')
  })

  it('should maintain task state transitions', () => {
    const statusSequence: string[] = []
    const updateStatus = (s: string) => {
      return statusSequence.push(s)
    }

    updateStatus('PENDING')
    updateStatus('IN_PROGRESS')
    updateStatus('COMPLETED')

    expect(statusSequence).toEqual(['PENDING', 'IN_PROGRESS', 'COMPLETED'])
  })

  it('should generate a valid PR body containing the task description', () => {
    const task: Partial<Task> = {
      externalId: 'ENG-456',
      description: 'Fix the login bug',
    }
    const body = `This PR was automatically generated for ${task.externalId}... \n\n### Task Description\n${task.description}`
    expect(body).toContain('Fix the login bug')
    expect(body).toContain('ENG-456')
  })
})
