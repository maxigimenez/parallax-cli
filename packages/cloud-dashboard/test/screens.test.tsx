import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import agentsFixture from './fixtures/agents.json'
import eventsFixture from './fixtures/runs_run_1_events.json'
import keysFixture from './fixtures/keys.json'
import meFixture from './fixtures/me.json'
import projectsFixture from './fixtures/projects.json'
import routesFixture from './fixtures/routes.json'
import runFixture from './fixtures/runs_run_1.json'
import runnersFixture from './fixtures/runners.json'
import runsFixture from './fixtures/runs_limit_100.json'
import slackFixture from './fixtures/integrations_slack.json'

/**
 * Renders the real screens against payloads recorded from a running cloud-api
 * over a real Postgres.
 *
 * Hand-written fixtures would have been typed from the source of `user.ts` and
 * would have agreed with it by construction — including on the details that
 * actually break a browser, like `run_events.ts` arriving as a string because
 * node-postgres will not narrow a bigint. These came off the wire.
 */
const ROUTES: Record<string, unknown> = {
  '/v1/me': meFixture,
  '/v1/runners': runnersFixture,
  '/v1/agents': agentsFixture,
  '/v1/projects': projectsFixture,
  '/v1/routes': routesFixture,
  '/v1/runs': runsFixture,
  '/v1/runs/run_1': runFixture,
  '/v1/runs/run_1/events': eventsFixture,
  '/v1/keys': keysFixture,
  '/v1/integrations/slack': slackFixture,
  '/v1/route-templates': { templates: [] },
  '/v1/prompt-templates': { templates: [], variables: ['ticket.ref', 'ticket.url'] },
}

beforeEach(() => {
  vi.resetModules()
  ;(window as unknown as { __PARALLAX__?: unknown }).__PARALLAX__ = { apiUrl: 'https://api.test' }
  window.localStorage.setItem('parallax.userKey', 'prx_usr_test')

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      const body = ROUTES[path]
      if (!body) {
        return new Response(JSON.stringify({ error: `no fixture for ${path}` }), { status: 404 })
      }
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

async function renderAt(path: string) {
  window.history.pushState({}, '', path)
  const { App } = await import('../src/App.js')
  return render(<App />)
}

describe('signed-in shell', () => {
  it('restores the stored key and shows the organization', async () => {
    await renderAt('/')
    expect(await screen.findByText('Parallax Labs')).toBeTruthy()
    // The nav is present, so the shell rendered rather than the login form.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
  })

  const withRunner = (patch: Record<string, unknown>) => {
    const runners = { runners: [{ ...runnersFixture.runners[0], ...patch }] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname
        const body = path === '/v1/runners' ? runners : ROUTES[path]
        return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 })
      })
    )
  }

  it('reports a runner that is checking in as live', async () => {
    withRunner({ stale: false, hermes_ok: true, active_runs: 0 })
    await renderAt('/')
    expect(await screen.findByText(/cerebro · live/)).toBeTruthy()
  })

  it('reports how many runs are in flight when there are any', async () => {
    withRunner({ stale: false, hermes_ok: true, active_runs: 3 })
    await renderAt('/')
    expect(await screen.findByText(/cerebro · 3 running/)).toBeTruthy()
  })

  it('names when a stale runner was last seen', async () => {
    withRunner({ stale: true })
    await renderAt('/')
    expect(await screen.findByText(/cerebro · last seen/)).toBeTruthy()
  })

  /**
   * Three states, not two. A runner that is checking in but cannot reach Hermes
   * will never start anything, and calling that healthy would defeat the point
   * of the indicator.
   */
  it('distinguishes a live runner that cannot reach Hermes', async () => {
    withRunner({ stale: false, hermes_ok: false, hermes_detail: 'ECONNREFUSED' })
    await renderAt('/')
    expect(await screen.findByText(/cerebro · hermes unreachable/)).toBeTruthy()
  })
})

describe('overview', () => {
  it('counts each status from the real run payload', async () => {
    await renderAt('/')
    // Scoped to the tiles: "running" and "failed" also appear as row badges.
    await screen.findByText('Flaky auth test on CI')
    const tiles = [...document.querySelectorAll('.px-stat')] as HTMLElement[]
    const tileFor = (label: string): HTMLElement =>
      tiles.find((tile) => within(tile).queryByText(label))!

    expect(within(tileFor('running')).getByText('2')).toBeTruthy()
    expect(within(tileFor('queued')).getByText('1')).toBeTruthy()
    expect(within(tileFor('failed')).getByText('1')).toBeTruthy()
    expect(within(tileFor('completed')).getByText('1')).toBeTruthy()
  })

  it('lists only the unfinished runs as active work', async () => {
    await renderAt('/')
    expect(await screen.findByText('Flaky auth test on CI')).toBeTruthy()
    expect(screen.getByText('Rate-limit the webhook fan-out')).toBeTruthy()
    expect(screen.getByText('Bump pg driver to 3.4')).toBeTruthy()
    // Completed and failed runs belong on the runs screen, not here.
    expect(screen.queryByText('Split ingest worker per tenant')).toBeNull()
  })

  it('warns that a failed run holds its label', async () => {
    await renderAt('/')
    expect(await screen.findByText(/parallax:failed/)).toBeTruthy()
  })
})

describe('run detail', () => {
  it('renders event times from a bigint timestamp rather than a dash', async () => {
    await renderAt('/runs/run_1')
    expect(await screen.findByText('Run created')).toBeTruthy()

    const times = document.querySelectorAll('.px-event__time')
    expect(times.length).toBeGreaterThan(0)
    for (const node of times) {
      expect(node.textContent).not.toBe('—')
    }
  })

  it('offers cancellation only while the run is unfinished', async () => {
    await renderAt('/runs/run_1')
    expect(await screen.findByRole('button', { name: /cancel run/i })).toBeTruthy()
  })
})

describe('other screens', () => {
  it('lists agents with their models', async () => {
    await renderAt('/agents')
    // The display name also reaches the avatar's accessible name, so more than
    // one node legitimately carries it.
    expect((await screen.findAllByText('Product')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('hermes-4-70b').length).toBe(2)
    expect(screen.getByText('hermes-4-405b')).toBeTruthy()
    // An agent with no display name falls back to its profile rather than blank.
    expect(screen.getAllByText('coder').length).toBeGreaterThan(0)
  })

  it('lists the stored route and offers to edit it', async () => {
    await renderAt('/routes')
    expect(await screen.findByText('Assess on label edited')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Edit route/ })).toBeTruthy()
    // Creating lives on its own page, so the list carries a link to it rather
    // than a form.
    expect(screen.getByRole('button', { name: /^new route$/i })).toBeTruthy()
  })

  it('lists the registered project', async () => {
    await renderAt('/projects')
    expect(await screen.findByText('acme/platform')).toBeTruthy()
  })

  it('marks the key in use and does not offer to revoke it', async () => {
    await renderAt('/keys')
    expect(await screen.findByText('this session')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /revoke key bootstrap user key/i })).toBeNull()
  })

  it('reports Slack as not connected', async () => {
    await renderAt('/settings')
    expect(await screen.findByText('not connected')).toBeTruthy()
  })
})

describe('signed out', () => {
  it('shows the login form when no key is stored', async () => {
    window.localStorage.clear()
    await renderAt('/')
    expect(await screen.findByRole('button', { name: /unlock workspace/i })).toBeTruthy()
  })

  it('drops a stored key the API rejects, rather than looping on 401s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 401 }))
    )
    await renderAt('/')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /unlock workspace/i })).toBeTruthy()
    )
    expect(window.localStorage.getItem('parallax.userKey')).toBeNull()
  })
})

describe('layout chain', () => {
  /**
   * ThemeProvider renders a real div between #root and the app. If our class
   * does not reach it, every percentage height below it resolves against an
   * auto-height box and the login card sits at the top of the window rather
   * than centred. This pins the class actually landing on that element.
   */
  it('puts px-root on the theme wrapper, so heights resolve', async () => {
    window.localStorage.clear()
    const { container } = await renderAt('/')
    const root = container.querySelector('.px-root')
    expect(root).not.toBeNull()

    const login = container.querySelector('.px-login')
    expect(login).not.toBeNull()
    // Direct child, so `.px-root > *` stretches it to the viewport.
    expect(login!.parentElement).toBe(root)
  })

  it('makes the shell a direct child of the same wrapper when signed in', async () => {
    const { container } = await renderAt('/')
    await screen.findByRole('navigation', { name: 'Primary' })
    const shell = container.querySelector('.px-shell')
    expect(shell!.parentElement).toBe(container.querySelector('.px-root'))
  })
})

describe('page header', () => {
  /**
   * Every list screen carries a create button and every detail screen does not,
   * so the actions slot must exist either way. Rendering it conditionally makes
   * the header — and the panel under it — shift by a button's height as you
   * move between sections.
   */
  it('renders the actions slot on every screen, with or without a button', async () => {
    for (const [path, expectAction] of [
      ['/', true],
      ['/runs', true],
      ['/routes', true],
      ['/projects', true],
      ['/keys', true],
      ['/agents', false],
      ['/settings', false],
    ] as const) {
      const { container, unmount } = await renderAt(path)
      await screen.findByRole('navigation', { name: 'Primary' })

      const slot = container.querySelector('.px-topbar__actions')
      expect(slot, `${path} must render an actions slot`).not.toBeNull()
      expect(slot!.childElementCount > 0, `${path} action button presence`).toBe(expectAction)
      unmount()
    }
  })
})
