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

const MAX_PR_SUMMARY_LINES = 10
const MAX_PR_SUMMARY_CHARS = 280

function isSummaryNoiseLine(line: string) {
  return SUMMARY_STOP_PATTERNS.some((pattern) => pattern.test(line))
}

function sanitizePrSummary(value: string | undefined) {
  const lines = value
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
    if (kept.length >= MAX_PR_SUMMARY_LINES) {
      break
    }
  }

  const normalized = kept.join('\n').trim()
  if (!normalized) {
    return undefined
  }

  if (normalized.length <= MAX_PR_SUMMARY_CHARS) {
    return normalized
  }

  const shortenedLines: string[] = []
  let remaining = MAX_PR_SUMMARY_CHARS
  for (const line of kept) {
    if (remaining <= 1) {
      break
    }

    const separatorLength = shortenedLines.length > 0 ? 1 : 0
    const available = remaining - separatorLength
    if (line.length <= available) {
      shortenedLines.push(line)
      remaining -= line.length + separatorLength
      continue
    }

    const truncated = `${line.slice(0, Math.max(available - 1, 0)).trimEnd()}…`.trim()
    if (truncated) {
      shortenedLines.push(truncated)
    }
    break
  }

  const shortened = shortenedLines.join('\n').trim()
  return shortened || normalized.slice(0, MAX_PR_SUMMARY_CHARS - 1).trimEnd() + '…'
}

export function extractExecutionMetadata(output: string): Pick<AgentResult, 'prTitle' | 'prSummary' | 'commitMessage'> {
  const titleMatch = output.match(/PARALLAX_PR_TITLE:\s*(.+)/i)
  const summaryMatch = output.match(/PARALLAX_PR_SUMMARY:\s*([\s\S]*?)(?:\nPARALLAX_|$)/i)
  const commitMessageMatch = output.match(/PARALLAX_COMMIT_MESSAGE:\s*(.+)/i)

  return {
    prTitle: sanitizeSingleLine(titleMatch?.[1]),
    prSummary: sanitizePrSummary(summaryMatch?.[1]),
    commitMessage: sanitizeSingleLine(commitMessageMatch?.[1]),
  }
}

export function sanitizeCommitMessage(commitMessage: string | undefined) {
  return sanitizeSingleLine(commitMessage)
}

export function normalizePrSummary(summary: string | undefined) {
  return sanitizePrSummary(summary)
}

export function buildDefaultCommitMessage(taskExternalId: string, taskTitle: string) {
  return sanitizeSingleLine(`Parallax: ${taskExternalId} - ${taskTitle}`)!
}
