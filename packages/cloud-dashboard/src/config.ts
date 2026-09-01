/**
 * Where the control plane lives.
 *
 * `/env.js` sets `window.__PARALLAX__` before the bundle runs, so the URL is a
 * deployment variable rather than a build artifact — the same image serves
 * staging and production. The build-time fallback exists only for `vite build`
 * previews run without a server.
 */
declare global {
  interface Window {
    __PARALLAX__?: { apiUrl?: string }
  }
}

function readApiUrl(): string {
  const injected = window.__PARALLAX__?.apiUrl?.trim()
  const fallback = import.meta.env.VITE_API_URL?.trim()
  const url = injected || fallback || ''
  // A trailing slash would produce `//v1/runs` on every request, which some
  // proxies normalise and others 404 on. Strip it once, here.
  return url.replace(/\/+$/, '')
}

export const API_URL = readApiUrl()

/** True when the page was served without an API URL, which is a deploy error. */
export const IS_CONFIGURED = API_URL.length > 0
