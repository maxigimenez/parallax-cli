import { describe, expect, it } from 'vitest'
import {
  buildDefaultCommitMessage,
  extractExecutionMetadata,
  sanitizeCommitMessage,
} from '../src/ai-adapters/execution-metadata.js'

describe('execution metadata', () => {
  it('extracts PR title, PR summary, and commit message from agent output', () => {
    const metadata = extractExecutionMetadata([
      'Work complete',
      'PARALLAX_PR_TITLE:   Improve dashboard loading   ',
      'PARALLAX_PR_SUMMARY:',
      '- Reduced N+1 queries',
      '- Added loading states',
      'PARALLAX_COMMIT_MESSAGE:  Tighten dashboard loading  ',
    ].join('\n'))

    expect(metadata.prTitle).toBe('Improve dashboard loading')
    expect(metadata.prSummary).toBe('- Reduced N+1 queries\n- Added loading states')
    expect(metadata.commitMessage).toBe('Tighten dashboard loading')
  })

  it('normalizes commit messages to a single line', () => {
    expect(sanitizeCommitMessage('  Fix   dashboard \n loading  ')).toBe('Fix dashboard loading')
  })

  it('builds a stable default commit message when AI output omits one', () => {
    expect(buildDefaultCommitMessage('e340140c8be1', 'Improve loading state')).toBe(
      'Parallax: e340140c8be1 - Improve loading state'
    )
  })
})
