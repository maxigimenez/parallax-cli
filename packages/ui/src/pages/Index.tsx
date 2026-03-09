import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { LogViewer } from '@/components/LogViewer'
import { SettingsViewer } from '@/components/SettingsViewer'
import { TaskSidebar } from '@/components/TaskSidebar'
import { useParallax } from '@/hooks/useParallax'
import { TASK_STATUS } from '@/lib/task-constants'

const TASK_VIEW = 'tasks'
const SETTINGS_VIEW = 'settings'
const SUMMARY_TAB = 'summary'

type ActiveView = typeof TASK_VIEW | typeof SETTINGS_VIEW
type ActiveTab = typeof SUMMARY_TAB | 'logs' | 'plan'

function resolveActiveView(view: string | null): ActiveView {
  return view === SETTINGS_VIEW ? SETTINGS_VIEW : TASK_VIEW
}

function resolveActiveTab(tab: string | null): ActiveTab {
  return tab === 'logs' || tab === 'plan' ? tab : SUMMARY_TAB
}

const Index = () => {
  const { tasks, config, isConnected, error, retryTask, cancelTask, approvePlan, rejectPlan } =
    useParallax()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeView = resolveActiveView(searchParams.get('view'))
  const selectedTaskId = searchParams.get('task')
  const activeTab = resolveActiveTab(searchParams.get('tab'))

  if (error) {
    throw error
  }

  const selectedEntityId = useMemo(() => {
    if (!selectedTaskId) {
      return null
    }

    if (selectedTaskId.startsWith('project-')) {
      return selectedTaskId
    }

    if (!tasks[selectedTaskId]) {
      throw new Error(`Selected task "${selectedTaskId}" is not available in the UI store.`)
    }

    return selectedTaskId
  }, [selectedTaskId, tasks])

  const selectedTask =
    selectedEntityId && !selectedEntityId.startsWith('project-') ? tasks[selectedEntityId] : null

  const handleSelectTask = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('task', id)
    if (!next.get('tab')) {
      next.set('tab', SUMMARY_TAB)
    }
    setSearchParams(next, { replace: true })
  }

  const handleViewChange = (view: ActiveView) => {
    const next = new URLSearchParams(searchParams)
    next.set('view', view)
    next.delete('task')
    next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  const handleTabChange = (tab: ActiveTab) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#060606]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeView === TASK_VIEW && selectedTask ? (
          <LogViewer
            taskId={selectedTask.id}
            title={selectedTask.title}
            msg={selectedTask.msg}
            description={selectedTask.description}
            projectId={selectedTask.projectId}
            logs={selectedTask.logs}
            status={selectedTask.status}
            branchName={selectedTask.branchName}
            prUrl={selectedTask.prUrl}
            prNumber={selectedTask.prNumber}
            lastReviewEventAt={selectedTask.lastReviewEventAt}
            reviewState={selectedTask.reviewState}
            planState={selectedTask.planState}
            planMarkdown={selectedTask.planMarkdown}
            planPrompt={selectedTask.planPrompt}
            planResult={selectedTask.planResult}
            config={config}
            onRetry={retryTask}
            onCancel={cancelTask}
            onApprovePlan={approvePlan}
            onRejectPlan={rejectPlan}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (activeView === SETTINGS_VIEW || selectedEntityId?.startsWith('project-')) &&
          selectedEntityId ? (
          <SettingsViewer
            projectIndex={Number.parseInt(selectedEntityId.replace('project-', ''), 10)}
            config={config}
          />
        ) : (
          <EmptyState
            view={activeView}
            isConnected={isConnected}
            hasTasks={Object.keys(tasks).length > 0}
            waitingTasks={Object.values(tasks).filter((task) => task.status === TASK_STATUS.QUEUED).length}
          />
        )}
      </div>

      <TaskSidebar
        selectedTaskId={selectedEntityId}
        onSelectTask={handleSelectTask}
        activeView={activeView}
        onViewChange={handleViewChange}
        tasks={Object.values(tasks)}
        config={config}
        isConnected={isConnected}
      />
    </div>
  )
}

export default Index
