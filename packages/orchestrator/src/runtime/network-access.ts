import type { IncomingMessage } from 'node:http'

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function hostnameFromHostHeader(host: string | undefined): string | undefined {
  if (!host) {
    return undefined
  }

  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

export function isAllowedBrowserOrigin(
  origin: string | undefined,
  requestHost: string | undefined,
  networkAccess: boolean
): boolean {
  if (!origin) {
    return true
  }

  if (!networkAccess) {
    return LOCAL_ORIGIN.test(origin)
  }

  try {
    const originUrl = new URL(origin)
    const requestHostname = hostnameFromHostHeader(requestHost)
    return originUrl.protocol === 'http:' && originUrl.hostname === requestHostname
  } catch {
    return false
  }
}

export function allowSocketRequest(networkAccess: boolean) {
  return (request: IncomingMessage, callback: (error: string | null, allowed: boolean) => void) => {
    callback(
      null,
      isAllowedBrowserOrigin(request.headers.origin, request.headers.host, networkAccess)
    )
  }
}
