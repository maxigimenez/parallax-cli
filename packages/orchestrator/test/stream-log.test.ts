import { describe, expect, it } from 'vitest'
import { TASK_LOG_KIND, TASK_LOG_LEVEL, TASK_LOG_SOURCE } from '@parallax/common'
import { classifyAgentLogChunk } from '../src/ai-adapters/stream-log.js'

describe('classifyAgentLogChunk', () => {
  it('classifies diff lines as diff output', () => {
    expect(classifyAgentLogChunk('diff --git a/app.ts b/app.ts', 'stdout')).toEqual({
      level: TASK_LOG_LEVEL.INFO,
      kind: TASK_LOG_KIND.FILE_CHANGE,
      source: TASK_LOG_SOURCE.AGENT,
      message: 'diff --git a/app.ts b/app.ts',
      groupId: 'diff:app.ts',
    })
  })

  it('classifies stderr warnings as warning events', () => {
    expect(classifyAgentLogChunk('warning: retrying request', 'stderr')).toEqual({
      level: TASK_LOG_LEVEL.WARNING,
      kind: TASK_LOG_KIND.WARNING,
      source: TASK_LOG_SOURCE.AGENT,
      message: 'warning: retrying request',
    })
  })

  it('does not classify generic stderr chatter as hard errors', () => {
    expect(
      classifyAgentLogChunk('Second line should be: SUMMARY: <one sentence>', 'stderr')
    ).toEqual({
      level: TASK_LOG_LEVEL.INFO,
      kind: TASK_LOG_KIND.AGENT_MESSAGE,
      source: TASK_LOG_SOURCE.AGENT,
      message: 'Second line should be: SUMMARY: <one sentence>',
    })
  })

  it('classifies MCP auth chatter as warnings instead of hard errors', () => {
    expect(
      classifyAgentLogChunk('mcp: notion failed: The notion MCP server is not logged in.', 'stderr')
    ).toEqual({
      level: TASK_LOG_LEVEL.WARNING,
      kind: TASK_LOG_KIND.WARNING,
      source: TASK_LOG_SOURCE.AGENT,
      message: 'mcp: notion failed: The notion MCP server is not logged in.',
    })
  })

  it('classifies normal stdout as agent notes', () => {
    expect(classifyAgentLogChunk('Implemented the requested change.', 'stdout')).toEqual({
      level: TASK_LOG_LEVEL.INFO,
      kind: TASK_LOG_KIND.AGENT_MESSAGE,
      source: TASK_LOG_SOURCE.AGENT,
      message: 'Implemented the requested change.',
    })
  })
})
