type RuntimeConfig = {
  apiBase?: string
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

  const envApiBase = import.meta.env.VITE_PARALLAX_API_BASE
  if (envApiBase) {
    return envApiBase
  }

  throw new Error('Parallax UI is missing API base configuration.')
}
