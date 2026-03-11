import { describe, expect, it } from 'vitest'
import { TASK_LOG_KIND, TASK_LOG_SOURCE, TASK_LOG_LEVEL, type TaskLogEntry } from '@parallax/common'
import { buildActivityItems, normalizeLogMessage } from '@/lib/log-presentation'

describe('log-presentation', () => {
  it('removes the task prefix from messages', () => {
    expect(normalizeLogMessage('[abc123] Starting task')).toBe('Starting task')
  })

  it('renders file changes as detail activity items', () => {
    const logs: TaskLogEntry[] = [
      {
        title: 'app.ts',
        message: '[abc123] diff --git a/app.ts b/app.ts\n@@ -1,2 +1,4 @@',
        icon: 'ℹ',
        level: TASK_LOG_LEVEL.INFO,
        timestamp: 1,
        kind: TASK_LOG_KIND.FILE_CHANGE,
        source: TASK_LOG_SOURCE.GIT,
      },
      {
        message: '[abc123] Plan approved',
        icon: 'ℹ',
        level: TASK_LOG_LEVEL.INFO,
        timestamp: 2,
        kind: TASK_LOG_KIND.LIFECYCLE,
        source: TASK_LOG_SOURCE.SYSTEM,
      },
    ]

    const items = buildActivityItems(logs)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'detail',
      kind: TASK_LOG_KIND.FILE_CHANGE,
      title: 'app.ts',
    })
    expect(items[1]).toMatchObject({
      type: 'compact',
      kind: TASK_LOG_KIND.LIFECYCLE,
      title: 'Event',
      message: 'Plan approved',
    })
  })

  it('renders command output as a detail item', () => {
    const logs: TaskLogEntry[] = [
      {
        title: 'pnpm test',
        message: '[abc123] PASS src/app.test.ts',
        icon: 'ℹ',
        level: TASK_LOG_LEVEL.INFO,
        timestamp: 1,
        kind: TASK_LOG_KIND.COMMAND,
        source: TASK_LOG_SOURCE.AGENT,
      },
    ]

    const items = buildActivityItems(logs)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'detail',
      kind: TASK_LOG_KIND.COMMAND,
      title: 'pnpm test',
      body: 'PASS src/app.test.ts',
    })
  })

  it('renders warnings as detail items', () => {
    const logs: TaskLogEntry[] = [
      {
        title: 'MCP setup warning',
        message: '[abc123] transport channel closed',
        icon: '⚠',
        level: TASK_LOG_LEVEL.WARNING,
        timestamp: 1,
        kind: TASK_LOG_KIND.WARNING,
        source: TASK_LOG_SOURCE.AGENT,
      },
    ]

    const items = buildActivityItems(logs)
    expect(items[0]).toMatchObject({
      type: 'detail',
      title: 'MCP setup warning',
    })
  })
})
