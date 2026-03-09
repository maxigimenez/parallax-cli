export type RetryMode = 'full' | 'execution'

export function parseRetryMode(value: string | undefined): RetryMode {
  if (value === undefined) {
    return 'full'
  }

  if (value === 'full' || value === 'execution') {
    return value
  }

  throw new Error(`Invalid retry mode '${value}'. Use 'full' or 'execution'.`)
}

export function parseNonNegativeInteger(value: string | undefined, label: string, defaultValue: number) {
  if (value === undefined) {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }

  return parsed
}

export function parsePositiveInteger(value: string | undefined, label: string, defaultValue: number) {
  if (value === undefined) {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`)
  }

  return parsed
}

export function parseOptionalTaskId(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('taskId must be a non-empty string.')
  }

  return trimmed
}
