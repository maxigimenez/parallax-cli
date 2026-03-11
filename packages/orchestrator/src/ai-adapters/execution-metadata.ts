import type { AgentResult } from '@parallax/common'

function sanitizeSingleLine(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : undefined
}

function sanitizeMultiline(value: string | undefined) {
  const normalized = value
    ?.split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

  return normalized ? normalized : undefined
}

export function extractExecutionMetadata(output: string): Pick<AgentResult, 'prTitle' | 'prSummary' | 'commitMessage'> {
  const titleMatch = output.match(/PARALLAX_PR_TITLE:\s*(.+)/i)
  const summaryMatch = output.match(/PARALLAX_PR_SUMMARY:\s*([\s\S]*?)(?:\nPARALLAX_|$)/i)
  const commitMessageMatch = output.match(/PARALLAX_COMMIT_MESSAGE:\s*(.+)/i)

  return {
    prTitle: sanitizeSingleLine(titleMatch?.[1]),
    prSummary: sanitizeMultiline(summaryMatch?.[1]),
    commitMessage: sanitizeSingleLine(commitMessageMatch?.[1]),
  }
}

export function sanitizeCommitMessage(commitMessage: string | undefined) {
  return sanitizeSingleLine(commitMessage)
}

export function buildDefaultCommitMessage(taskExternalId: string, taskTitle: string) {
  return sanitizeSingleLine(`Parallax: ${taskExternalId} - ${taskTitle}`)!
}
