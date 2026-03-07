/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARALLAX_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __PARALLAX_RUNTIME_CONFIG__?: {
    apiBase?: string
  }
}
