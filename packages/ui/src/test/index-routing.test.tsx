import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AGENT_PROVIDER, LOG_LEVEL, PULL_PROVIDER, TaskPlanState, TASK_REVIEW_STATE } from '@parallax/common'
import Index from '@/pages/Index'

vi.mock('@/hooks/useParallax', () => ({
  useParallax: () => ({
    tasks: {
      'task-1': {
        id: 'task-1',
        externalId: 'REV-1',
        title: 'Improve task dashboard',
        description: 'Move the plan into the default view',
        projectId: 'annu-dev',
        msg: 'Plan ready. Awaiting approval.',
        startTime: 1,
        status: 'queued',
        planState: TaskPlanState.PLAN_READY,
        planMarkdown: '- Bring the plan into the dashboard',
        planPrompt: undefined,
        planResult: undefined,
        lastAgent: AGENT_PROVIDER.CODEX,
        executionAttempts: 0,
        logs: [
          {
            message: '[task-1] Plan ready',
            icon: 'ℹ',
            level: 'info',
            timestamp: 1,
            kind: 'lifecycle',
            source: 'system',
          },
        ],
        reviewState: TASK_REVIEW_STATE.NONE,
      },
    },
    config: {
      concurrency: 1,
      logs: [LOG_LEVEL.INFO],
      server: { apiPort: 3000, uiPort: 8080 },
      projects: [
        {
          id: 'annu-dev',
          workspaceDir: '/tmp/annu-dev',
          pullFrom: { provider: PULL_PROVIDER.LINEAR, filters: {} },
          agent: { provider: AGENT_PROVIDER.CODEX },
        },
      ],
    },
    isConnected: true,
    error: null,
    orchestratorErrors: [],
    retryTask: vi.fn(),
    cancelTask: vi.fn(),
    approvePlan: vi.fn(),
    rejectPlan: vi.fn(),
  }),
}))

vi.mock('@/components/EmptyState', () => ({
  EmptyState: () => <div>Empty state</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderIndex(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Index />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/tasks/:taskId"
          element={
            <>
              <Index />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/tasks/:taskId/logs"
          element={
            <>
              <Index />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('Index task routing', () => {
  it('navigates to the dashboard route when selecting a task from the sidebar', () => {
    renderIndex(['/'])

    fireEvent.click(screen.getByRole('button', { name: /task-1/i }))

    expect(screen.getByTestId('location').textContent).toBe('/tasks/task-1')
    expect(screen.getByText('Editable execution plan')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull()
  })

  it('opens the dedicated logs route from the selected task dashboard', () => {
    renderIndex(['/tasks/task-1'])

    fireEvent.click(screen.getByRole('button', { name: 'Logs' }))

    expect(screen.getByTestId('location').textContent).toBe('/tasks/task-1/logs')
    expect(screen.getByPlaceholderText('Search transcript')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.queryByText('Execution plan')).toBeNull()
  })
})
