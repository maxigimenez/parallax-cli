/**
 * The one thing Sentinel0 asks every agent to emit.
 *
 * This replaces the old SENTINEL0_PR_TITLE / SENTINEL0_PR_SUMMARY /
 * SENTINEL0_COMMIT_MESSAGE trio, which existed so Sentinel0 could open the pull
 * request itself. Hermes agents do their own git and their own PRs now, so the
 * only thing Sentinel0 still needs back is a human-readable summary to store on
 * the run and post to the tracker.
 */

export const SUMMARY_SENTINEL = 'SENTINEL0_SUMMARY'

/**
 * Lines that mean the agent has stopped summarizing and started dumping.
 *
 * Inherited from the previous implementation, where agents reliably ran past
 * the end of a summary into diffs and code. Truncating at the first of these
 * keeps a tracker comment readable.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^\s*```/,
  /^diff --git /,
  /^@@ /,
  /^[+-]{3} /,
  /^[+-]\S/,
  /^\s*(?:import|export|const|function|class)\s/,
  /^\s*\$ /,
]

export function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line))
}

/**
 * Pulls the summary out of an agent's final output.
 *
 * Uses the LAST sentinel occurrence, not the first: agents routinely restate
 * the instructions they were given before doing the work, and the echo would
 * otherwise win over the real answer.
 */
export function extractSummary(output: string, maxLines = 10): string | undefined {
  const pattern = new RegExp(`^\\s*${SUMMARY_SENTINEL}\\s*:\\s*(.*)$`, 'gim')

  let match: RegExpExecArray | null
  let last: RegExpExecArray | null = null
  while ((match = pattern.exec(output)) !== null) {
    last = match
  }

  if (!last) {
    return undefined
  }

  const tail = output.slice(last.index + last[0].length - last[1].length)
  const lines: string[] = []

  for (const line of tail.split('\n')) {
    if (isNoiseLine(line)) {
      break
    }
    if (lines.length >= maxLines) {
      break
    }
    lines.push(line)
  }

  const summary = lines.join('\n').trim()
  return summary.length > 0 ? summary : undefined
}

/**
 * Best-effort summary for a run whose agent ignored the contract.
 *
 * Falls back to the tail rather than the head: the useful part of a rambling
 * agent transcript is almost always its conclusion.
 */
export function summarizeFallback(output: string, maxLines = 10): string | undefined {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isNoiseLine(line))

  if (lines.length === 0) {
    return undefined
  }
  return lines.slice(-maxLines).join('\n')
}

/** The summary Sentinel0 records, whether or not the agent cooperated. */
export function resolveSummary(output: string): string | undefined {
  return extractSummary(output) ?? summarizeFallback(output)
}
