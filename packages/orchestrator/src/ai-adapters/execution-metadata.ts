import type { AgentResult } from '@parallax/common'

function sanitizeSingleLine(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : undefined
}

const SUMMARY_STOP_PATTERNS = [
  /^diff\s+--git\b/i,
  /^index\s+[0-9a-f]+\.\.[0-9a-f]+/i,
  /^@@\s+/,
  /^(---|\+\+\+)\s+/,
  /^```/,
  /^<script\b/i,
  /^<template\b/i,
  /^import\s+.+\s+from\s+/,
  /^export\s+/,
  /^const\s+/,
  /^function\s+/,
]

function isSummaryNoiseLine(line: string) {
  return SUMMARY_STOP_PATTERNS.some((pattern) => pattern.test(line))
}

function extractPrSummary(output: string) {
  const summaryMatch = output.match(/PARALLAX_PR_SUMMARY:\s*([\s\S]*?)(?:\nPARALLAX_|$)/i)
  const lines = summaryMatch?.[1]
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines?.length) {
    return undefined
  }

  const kept: string[] = []
  for (const line of lines) {
    if (isSummaryNoiseLine(line)) {
      break
    }
    kept.push(line)
  }

  const normalized = kept.join('\n').trim()
  return normalized || undefined
}

export function extractExecutionMetadata(output: string): Pick<AgentResult, 'prTitle' | 'prSummary' | 'commitMessage'> {
  const titleMatch = output.match(/PARALLAX_PR_TITLE:\s*(.+)/i)
  const commitMessageMatch = output.match(/PARALLAX_COMMIT_MESSAGE:\s*(.+)/i)

  return {
    prTitle: sanitizeSingleLine(titleMatch?.[1]),
    prSummary: extractPrSummary(output),
    commitMessage: sanitizeSingleLine(commitMessageMatch?.[1]),
  }
}

export function sanitizeCommitMessage(commitMessage: string | undefined) {
  return sanitizeSingleLine(commitMessage)
}

export function normalizePrSummary(summary: string | undefined) {
  return extractPrSummary(`PARALLAX_PR_SUMMARY:\n${summary ?? ''}`)
}

export function buildDefaultCommitMessage(taskExternalId: string, taskTitle: string) {
  return sanitizeSingleLine(`Parallax: ${taskExternalId} - ${taskTitle}`)!
}
