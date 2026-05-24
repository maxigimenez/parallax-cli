import { describe, expect, it } from 'vitest'
import {
  buildDefaultCommitMessage,
  extractExecutionMetadata,
  normalizePrSummary,
  sanitizeCommitMessage,
} from '../src/ai-adapters/execution-metadata.js'

describe('execution metadata', () => {
  it('extracts PR title, PR summary, and commit message from agent output', () => {
    const metadata = extractExecutionMetadata(
      [
        'Work complete',
        'PARALLAX_PR_TITLE:   Improve dashboard loading   ',
        'PARALLAX_PR_SUMMARY:',
        '- Reduced N+1 queries',
        '- Added loading states',
        'PARALLAX_COMMIT_MESSAGE:  Tighten dashboard loading  ',
      ].join('\n')
    )

    expect(metadata.prTitle).toBe('Improve dashboard loading')
    expect(metadata.prSummary).toBe('- Reduced N+1 queries\n- Added loading states')
    expect(metadata.commitMessage).toBe('Tighten dashboard loading')
  })

  it('normalizes commit messages to a single line and appends [parallax]', () => {
    expect(sanitizeCommitMessage('  Fix   dashboard \n loading  ')).toBe(
      'Fix dashboard loading [parallax]'
    )
  })

  it('does not double-append [parallax] if already present', () => {
    expect(sanitizeCommitMessage('feat: add thing [parallax]')).toBe('feat: add thing [parallax]')
  })

  it('builds a default conventional commit message when AI output omits one', () => {
    expect(buildDefaultCommitMessage('e340140c8be1', 'Improve loading state')).toBe(
      'feat: Improve loading state [parallax]'
    )
  })

  it('strips diff and code noise from PR summaries', () => {
    const summary = normalizePrSummary(
      [
        'Removes the default-model field from persona saves and adds a reusable model selector.',
        '- Updates request handlers so actions use the selected model.',
        'diff --git a/components/ai/ModelSelect.vue b/components/ai/ModelSelect.vue',
        '+++ b/components/ai/ModelSelect.vue',
        '@@ -0,0 +1,37 @@',
      ].join('\n')
    )

    expect(summary).toBe(
      [
        'Removes the default-model field from persona saves and adds a reusable model selector.',
        '- Updates request handlers so actions use the selected model.',
      ].join('\n')
    )
  })

  it('preserves prose summaries while dropping trailing noise', () => {
    const summary = normalizePrSummary(
      [
        'Removes the default-model field from persona/onboarding saves and adds a lightweight reusable model dropdown to AI module entry points.',
        '- Threads an optional model through request schemas and API handlers so each action uses the selected model.',
        '- Keeps legacy profiles falling back to stored default_model during migration.',
        '- Extra detail that should never appear in the final PR summary.',
        'diff --git a/components/ai/ModelSelect.vue b/components/ai/ModelSelect.vue',
      ].join('\n')
    )

    expect(summary).toBe(
      [
        'Removes the default-model field from persona/onboarding saves and adds a lightweight reusable model dropdown to AI module entry points.',
        '- Threads an optional model through request schemas and API handlers so each action uses the selected model.',
        '- Keeps legacy profiles falling back to stored default_model during migration.',
        '- Extra detail that should never appear in the final PR summary.',
      ].join('\n')
    )
  })
})
