import os from 'node:os'

export function resolveNetworkHostname(): string {
  const hostname = os.hostname()
  if (process.platform === 'darwin' && !hostname.includes('.')) {
    return `${hostname}.local`
  }
  return hostname
}

export function buildDashboardUrl(hostname: string, port: number): string {
  const formattedHostname = hostname.includes(':') ? `[${hostname}]` : hostname
  return `http://${formattedHostname}:${port}`
}
