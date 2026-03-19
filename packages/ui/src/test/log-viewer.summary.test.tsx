import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AGENT_PROVIDER, LOG_LEVEL, PULL_PROVIDER, TaskPlanState } from '@parallax/common'
import { LogViewer } from '@/components/LogViewer'
import { TASK_STATUS } from '@/lib/task-constants'

const config = {
  concurrency: 1,
  logs: [LOG_LEVEL.INFO],
  server: {
    apiPort: 3000,
    uiPort: 8080,
  },
  projects: [
    {
      id: 'annu-dev',
      workspaceDir: '/tmp/annu-dev',
      pullFrom: { provider: PULL_PROVIDER.LINEAR, filters: {} },
      agent: {
        provider: AGENT_PROVIDER.CODEX,
        model: 'gpt-5.4',
      },
    },
  ],
}

describe('LogViewer dashboard', () => {
  it('renders the plan section together with outcome and metadata', () => {
    render(
      <LogViewer
        taskId="sid-104"
        title="Remove the default model"
        description="Task description"
        projectId="annu-dev"
        logs={[]}
        status={TASK_STATUS.DONE}
        branchName="task/sid-104"
        prUrl="https://github.com/maxigimenez/annu.dev/pull/7"
        planState={TaskPlanState.PLAN_APPROVED}
        planMarkdown={'- Ship the change\n- Verify the CLI flow'}
        lastAgent={AGENT_PROVIDER.GEMINI}
        config={config}
        viewMode="dashboard"
      />
    )

    expect(screen.getAllByText('Task details').length).toBeGreaterThan(0)
    expect(screen.getByText('Execution plan')).toBeTruthy()
    expect(screen.getByText(/- Ship the change/)).toBeTruthy()
    expect(screen.getByText(/- Verify the CLI flow/)).toBeTruthy()
    expect(screen.getByText('Delivery result')).toBeTruthy()
    expect(screen.getByText('annu-dev')).toBeTruthy()
    expect(screen.getByText('linear')).toBeTruthy()
    expect(screen.getByText('Gemini')).toBeTruthy()
    expect(screen.getByText('gpt-5.4')).toBeTruthy()
    expect(screen.getByText('https://github.com/maxigimenez/annu.dev/pull/7')).toBeTruthy()
    expect(screen.getByText('parallax pr-review sid-104')).toBeTruthy()
  })

  it('renders editable plan actions on the dashboard when approval is pending', () => {
    render(
      <LogViewer
        taskId="sid-105"
        title="Tighten dashboard"
        description="Task description"
        projectId="annu-dev"
        logs={[]}
        status={TASK_STATUS.QUEUED}
        planState={TaskPlanState.PLAN_READY}
        planMarkdown={'- Review the task\n- Update the layout'}
        config={config}
        viewMode="dashboard"
      />
    )

    expect(screen.getByText('Waiting for plan approval')).toBeTruthy()
    expect(screen.getByText('Plan approval required')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '- Review the task\n- Update the layout'
    )
  })

  it('keeps the plan visible but read-only for failed tasks', () => {
    render(
      <LogViewer
        taskId="sid-106"
        title="Handle failure"
        description="Task description"
        projectId="annu-dev"
        logs={[]}
        status={TASK_STATUS.FAILED}
        planState={TaskPlanState.PLAN_APPROVED}
        planMarkdown={'- Reproduce the issue\n- Fix the regression'}
        config={config}
        viewMode="dashboard"
      />
    )

    expect(screen.getByText(/- Reproduce the issue/)).toBeTruthy()
    expect(screen.getByText(/- Fix the regression/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Plan actions are disabled once a task is failed or canceled.')).toBeTruthy()
  })

  it('renders the dedicated logs view with filters and dashboard return action', () => {
    const onOpenDashboard = vi.fn()

    render(
      <LogViewer
        taskId="sid-107"
        title="Inspect logs"
        description="Task description"
        projectId="annu-dev"
        logs={[
          {
            message: '[sid-107] command started',
            icon: 'ℹ',
            level: 'info',
            timestamp: 1,
            kind: 'lifecycle',
            source: 'system',
          },
        ]}
        status={TASK_STATUS.RUNNING}
        planState={TaskPlanState.PLAN_APPROVED}
        lastAgent={AGENT_PROVIDER.CODEX}
        config={config}
        viewMode="logs"
        onOpenDashboard={onOpenDashboard}
      />
    )

    expect((screen.getByRole('button', { name: 'Logs' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByPlaceholderText('Search transcript')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Info' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transcript' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }))
    expect(onOpenDashboard).toHaveBeenCalledOnce()
  })

  it('filters transcript lines by free text search', () => {
    render(
      <LogViewer
        taskId="sid-109"
        title="Search logs"
        description="Task description"
        projectId="annu-dev"
        logs={[
          {
            message: '[sid-109] generated PR branch',
            icon: 'ℹ',
            level: 'info',
            timestamp: 1,
            kind: 'lifecycle',
            source: 'system',
          },
          {
            message: '[sid-109] waiting for approval',
            icon: 'ℹ',
            level: 'info',
            timestamp: 2,
            kind: 'agent_message',
            source: 'system',
          },
        ]}
        status={TASK_STATUS.RUNNING}
        config={config}
        viewMode="logs"
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Search transcript'), {
      target: { value: 'approval' },
    })

    expect(screen.getByText(/waiting for approval/)).toBeTruthy()
    expect(screen.queryByText(/generated PR branch/)).toBeNull()
  })

  it('renders an info alert when no plan is available for the task', () => {
    render(
      <LogViewer
        taskId="sid-108"
        title="No plan available"
        description="Task description"
        projectId="annu-dev"
        logs={[]}
        status={TASK_STATUS.DONE}
        config={config}
        viewMode="dashboard"
      />
    )

    expect(screen.getByText('Execution plan')).toBeTruthy()
    expect(screen.getByText('Plan is not available for this task.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
