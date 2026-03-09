import { describe, expect, it } from 'vitest'
import { TASK_STATUS } from '@/lib/task-constants'
import {
  applyTaskLogEvent,
  applyTaskStatusEvent,
  removeTaskState,
  replaceTasksFromApi,
} from '@/lib/task-store'

describe('task store reducers', () => {
  it('replaces tasks from api using the canonical id key', () => {
    const tasks = replaceTasksFromApi(
      {},
      [
        {
          id: 'eng-123-f495c0bc',
          externalId: 'ENG-123',
          title: 'Fix pipeline',
          description: 'Fix pipeline task',
          projectId: 'p1',
          msg: 'queued',
          startTime: 1,
          status: 'PENDING',
          executionAttempts: 0,
          reviewState: 'NONE',
          logs: [],
        },
      ]
    )

    expect(Object.keys(tasks)).toEqual(['eng-123-f495c0bc'])
    expect(tasks['eng-123-f495c0bc']?.externalId).toBe('ENG-123')
    expect(tasks['eng-123-f495c0bc']?.status).toBe(TASK_STATUS.QUEUED)
  })

  it('deduplicates repeated log events', () => {
    const initial = replaceTasksFromApi(
      {},
      [
        {
          id: 'eng-123-f495c0bc',
          externalId: 'ENG-123',
          title: 'Fix pipeline',
          description: 'Fix pipeline task',
          projectId: 'p1',
          msg: 'queued',
          startTime: 1,
          status: 'PENDING',
          executionAttempts: 0,
          reviewState: 'NONE',
          logs: [],
        },
      ]
    )

    const once = applyTaskLogEvent(initial, {
      taskId: 'eng-123-f495c0bc',
      msg: 'Starting execution',
      icon: 'ℹ',
      level: 'info',
      timestamp: 10,
    })

    const twice = applyTaskLogEvent(once, {
      taskId: 'eng-123-f495c0bc',
      msg: 'Starting execution',
      icon: 'ℹ',
      level: 'info',
      timestamp: 10,
    })

    expect(twice['eng-123-f495c0bc']?.logs).toHaveLength(1)
  })

  it('updates task status from socket events', () => {
    const initial = replaceTasksFromApi(
      {},
      [
        {
          id: 'eng-123-f495c0bc',
          externalId: 'ENG-123',
          title: 'Fix pipeline',
          description: 'Fix pipeline task',
          projectId: 'p1',
          msg: 'queued',
          startTime: 1,
          status: 'PENDING',
          executionAttempts: 0,
          reviewState: 'NONE',
          logs: [],
        },
      ]
    )

    const next = applyTaskStatusEvent(initial, { taskId: 'eng-123-f495c0bc', status: 'done' })
    expect(next['eng-123-f495c0bc']?.status).toBe(TASK_STATUS.DONE)
  })

  it('removes tasks idempotently', () => {
    const next = removeTaskState(
      {
        'eng-123-f495c0bc': {
          id: 'eng-123-f495c0bc',
          externalId: 'ENG-123',
          title: 'Fix pipeline',
          description: 'Fix pipeline task',
          projectId: 'p1',
          msg: 'done',
          startTime: 1,
          status: TASK_STATUS.DONE,
          executionAttempts: 0,
          reviewState: 'NONE',
          logs: [],
        },
      },
      'eng-123-f495c0bc'
    )

    expect(next).toEqual({})
    expect(removeTaskState(next, 'eng-123-f495c0bc')).toEqual({})
  })
})
