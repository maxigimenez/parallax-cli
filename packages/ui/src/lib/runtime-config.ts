type RuntimeConfig = {
  apiBase?: string
  apiPort?: number
}

declare global {
  interface Window {
    __PARALLAX_RUNTIME_CONFIG__?: RuntimeConfig
  }
}

export function getRequiredApiBase() {
  const runtimeApiBase = window.__PARALLAX_RUNTIME_CONFIG__?.apiBase
  if (runtimeApiBase) {
    return runtimeApiBase
  }

  const runtimeApiPort =
    window.__PARALLAX_RUNTIME_CONFIG__?.apiPort ?? import.meta.env.VITE_PARALLAX_API_PORT
  if (runtimeApiPort) {
    const rawHostname = window.location.hostname
    const hostname =
      rawHostname.startsWith('[') && rawHostname.endsWith(']')
        ? rawHostname
        : rawHostname.includes(':')
          ? `[${rawHostname}]`
          : rawHostname
    return `${window.location.protocol}//${hostname}:${runtimeApiPort}`
  }

  const envApiBase = import.meta.env.VITE_PARALLAX_API_BASE
  if (envApiBase) {
    return envApiBase
  }

  throw new Error('Parallax UI is missing API base configuration.')
}
