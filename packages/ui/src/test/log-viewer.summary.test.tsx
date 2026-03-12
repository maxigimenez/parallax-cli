import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
      },
    },
  ],
}

describe('LogViewer summary', () => {
  it('renders the result card with PR link, branch, and review shortcut', () => {
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
        config={config}
        activeTab="summary"
        onTabChange={() => {}}
      />
    )

    expect(screen.getByText('Delivery result')).toBeTruthy()
    expect(screen.getByText('https://github.com/maxigimenez/annu.dev/pull/7')).toBeTruthy()
    expect(screen.getByText('task/sid-104')).toBeTruthy()
    expect(screen.getByText('parallax pr-review sid-104')).toBeTruthy()
    expect(screen.queryByText('Run Result')).toBeNull()
  })

  it('renders an approval alert when plan approval is pending', () => {
    render(
      <LogViewer
        taskId="sid-105"
        title="Tighten dashboard"
        description="Task description"
        projectId="annu-dev"
        logs={[]}
        status={TASK_STATUS.QUEUED}
        planState={TaskPlanState.PLAN_READY}
        config={config}
        activeTab="summary"
        onTabChange={() => {}}
      />
    )

    expect(screen.getByText('Waiting for plan approval')).toBeTruthy()
    expect(screen.getByText('Plan approval required')).toBeTruthy()
    expect(screen.getByText('Plan State')).toBeTruthy()
  })
})
