type TaskDiffFile = {
  path: string
  status: 'A' | 'M' | 'D' | 'R'
}

export type ParsedDiffFile = {
  patch: string
  status: TaskDiffFile['status']
}

export function splitUnifiedDiffByFile(diffText: string): Map<string, ParsedDiffFile> {
  const result = new Map<string, ParsedDiffFile>()
  if (!diffText.trim()) {
    return result
  }

  const chunks = diffText.split(/^diff --git /m).filter((chunk) => chunk.trim())
  for (const rawChunk of chunks) {
    const chunk = `diff --git ${rawChunk}`
    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    if (!headerMatch) {
      continue
    }

    const path = headerMatch[2].trim()
    let status: TaskDiffFile['status'] = 'M'
    if (/^new file mode\s/m.test(chunk)) {
      status = 'A'
    } else if (/^deleted file mode\s/m.test(chunk)) {
      status = 'D'
    } else if (/^rename from\s/m.test(chunk) || /^rename to\s/m.test(chunk)) {
      status = 'R'
    }

    result.set(path, { patch: chunk.trim(), status })
  }

  return result
}
