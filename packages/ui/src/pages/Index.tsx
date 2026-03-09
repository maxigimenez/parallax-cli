import { EmptyState } from '@/components/EmptyState'
import { LogViewer } from '@/components/LogViewer'
import { SettingsViewer } from '@/components/SettingsViewer'
import { TaskSidebar } from '@/components/TaskSidebar'
import { useParallax } from '@/hooks/useParallax'
import { TASK_STATUS } from '@/lib/task-constants'
import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

const TASK_VIEW = 'tasks'
const SETTINGS_VIEW = 'settings'
const SUMMARY_TAB = 'summary'

type ActiveView = typeof TASK_VIEW | typeof SETTINGS_VIEW
type ActiveTab = typeof SUMMARY_TAB | 'logs' | 'plan'

function resolveActiveView(pathname: string): ActiveView {
  return pathname.startsWith('/settings') ? SETTINGS_VIEW : TASK_VIEW
}

function resolveActiveTab(tab: string | undefined): ActiveTab {
  return tab === 'logs' || tab === 'plan' ? tab : SUMMARY_TAB
}

const Index = () => {
  const { tasks, config, isConnected, error, retryTask, cancelTask, approvePlan, rejectPlan } =
    useParallax()
  const navigate = useNavigate()
  const location = useLocation()
  const { taskId, tab, projectIndex } = useParams<{
    taskId?: string
    tab?: string
    projectIndex?: string
  }>()

  if (error) {
    throw error
  }

  const activeView = resolveActiveView(location.pathname)
  const activeTab = resolveActiveTab(tab)
  const selectedTask = taskId ? tasks[taskId] ?? null : null
  const selectedTaskId = taskId ?? null
  const selectedSettingsId = projectIndex ? `project-${projectIndex}` : null
  const selectedSidebarId = activeView === TASK_VIEW ? selectedTaskId : selectedSettingsId

  const waitingTasks = useMemo(
    () => Object.values(tasks).filter((task) => task.status === TASK_STATUS.QUEUED).length,
    [tasks]
  )

  const handleSelectTask = (id: string) => {
    if (id.startsWith('project-')) {
      navigate(`/settings/${id.replace('project-', '')}`)
      return
    }

    navigate(`/tasks/${id}/${SUMMARY_TAB}`)
  }

  const handleViewChange = (view: ActiveView) => {
    navigate(view === SETTINGS_VIEW ? '/settings' : '/')
  }

  const handleTabChange = (nextTab: ActiveTab) => {
    if (!taskId) {
      return
    }

    navigate(`/tasks/${taskId}/${nextTab}`)
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
        ) : activeView === SETTINGS_VIEW && projectIndex !== undefined ? (
          <SettingsViewer projectIndex={Number.parseInt(projectIndex, 10)} config={config} />
        ) : (
          <EmptyState
            view={activeView}
            isConnected={isConnected}
            hasTasks={Object.keys(tasks).length > 0}
            waitingTasks={waitingTasks}
          />
        )}
      </div>

      <TaskSidebar
        selectedTaskId={selectedSidebarId}
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
