import { EmptyState } from '@/components/EmptyState'
import { LogViewer } from '@/components/LogViewer'
import { OrchestratorErrorOverlay } from '@/components/OrchestratorErrorOverlay'
import { SettingsViewer } from '@/components/SettingsViewer'
import { TaskSidebar } from '@/components/TaskSidebar'
import { useParallax } from '@/hooks/useParallax'
import { TASK_STATUS } from '@/lib/task-constants'
import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

const TASK_VIEW = 'tasks'
const SETTINGS_VIEW = 'settings'
const DASHBOARD_VIEW = 'dashboard'
const LOGS_VIEW = 'logs'

type ActiveView = typeof TASK_VIEW | typeof SETTINGS_VIEW
type TaskDetailView = typeof DASHBOARD_VIEW | typeof LOGS_VIEW

function resolveActiveView(pathname: string): ActiveView {
  return pathname.startsWith('/settings') ? SETTINGS_VIEW : TASK_VIEW
}

function resolveTaskDetailView(pathname: string): TaskDetailView {
  return pathname.endsWith('/logs') ? LOGS_VIEW : DASHBOARD_VIEW
}

const Index = () => {
  const {
    tasks,
    config,
    isConnected,
    error,
    orchestratorErrors,
    retryTask,
    cancelTask,
    approvePlan,
    rejectPlan,
  } =
    useParallax()
  const navigate = useNavigate()
  const location = useLocation()
  const { taskId, projectIndex } = useParams<{
    taskId?: string
    projectIndex?: string
  }>()

  if (error) {
    throw error
  }

  const activeView = resolveActiveView(location.pathname)
  const taskDetailView = resolveTaskDetailView(location.pathname)
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

    navigate(`/tasks/${id}`)
  }

  const handleViewChange = (view: ActiveView) => {
    navigate(view === SETTINGS_VIEW ? '/settings' : '/')
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
            planState={selectedTask.planState}
            planMarkdown={selectedTask.planMarkdown}
            planPrompt={selectedTask.planPrompt}
            planResult={selectedTask.planResult}
            lastAgent={selectedTask.lastAgent}
            config={config}
            onRetry={retryTask}
            onCancel={cancelTask}
            onApprovePlan={approvePlan}
            onRejectPlan={rejectPlan}
            viewMode={taskDetailView}
            onOpenLogs={() => navigate(`/tasks/${selectedTask.id}/logs`)}
            onOpenDashboard={() => navigate(`/tasks/${selectedTask.id}`)}
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
      <OrchestratorErrorOverlay errors={orchestratorErrors} />
    </div>
  )
}

export default Index
