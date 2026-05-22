import { useState, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { LogViewer } from '@/components/LogViewer'
import { OrchestratorErrorOverlay } from '@/components/OrchestratorErrorOverlay'
import { NavBar } from '@/components/NavBar'
import { ListPanel, type ActiveView } from '@/components/ListPanel'
import { ProjectEditor } from '@/components/ProjectEditor'
import { AddProjectWizard } from '@/components/AddProjectWizard'
import { IntegrationDetail } from '@/components/IntegrationDetail'
import { SecretsEditor } from '@/components/SecretsEditor'
import { useParallax } from '@/hooks/useParallax'
import { TASK_STATUS } from '@/lib/task-constants'

type TaskDetailView = 'dashboard' | 'logs'

function resolveActiveView(pathname: string): ActiveView {
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/integrations')) return 'integrations'
  if (pathname.startsWith('/secrets')) return 'secrets'
  return 'tasks'
}

function resolveTaskDetailView(pathname: string): TaskDetailView {
  return pathname.endsWith('/logs') ? 'logs' : 'dashboard'
}

const Index = () => {
  const {
    tasks,
    config,
    secrets,
    isConnected,
    error,
    orchestratorErrors,
    retryTask,
    cancelTask,
    approvePlan,
    rejectPlan,
    createProject,
    updateProject,
    deleteProject,
    saveSlack,
    removeSlack,
    setSecret,
    deleteSecret,
  } = useParallax()

  const navigate = useNavigate()
  const location = useLocation()
  const { taskId, projectId, integrationName } = useParams<{
    taskId?: string
    projectId?: string
    integrationName?: string
  }>()

  const [showAddProject, setShowAddProject] = useState(false)

  if (error) {
    throw error
  }

  const activeView = resolveActiveView(location.pathname)
  const taskDetailView = resolveTaskDetailView(location.pathname)
  const selectedTask = taskId ? tasks[taskId] ?? null : null

  const selectedSidebarId = useMemo(() => {
    if (activeView === 'tasks') return taskId ?? null
    if (activeView === 'projects' && projectId) return `project-${projectId}`
    if (activeView === 'integrations' && integrationName) return `integration-${integrationName}`
    return null
  }, [activeView, taskId, projectId, integrationName])

  const waitingTasks = useMemo(
    () => Object.values(tasks).filter((task) => task.status === TASK_STATUS.QUEUED).length,
    [tasks]
  )

  const handleSelectItem = (id: string) => {
    if (id.startsWith('project-')) {
      navigate(`/projects/${id.replace('project-', '')}`)
      return
    }
    if (id.startsWith('integration-')) {
      navigate(`/integrations/${id.replace('integration-', '')}`)
      return
    }
    navigate(`/tasks/${id}`)
  }

  const handleViewChange = (view: ActiveView) => {
    const routes: Record<ActiveView, string> = {
      tasks: '/',
      projects: '/projects',
      integrations: '/integrations',
      secrets: '/secrets',
    }
    navigate(routes[view])
  }

  const selectedProject = useMemo(() => {
    if (!projectId || !config) return null
    return config.projects.find((p) => p.id === projectId) ?? null
  }, [projectId, config])

  const mainContent = () => {
    if (activeView === 'tasks') {
      if (selectedTask) {
        return (
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
        )
      }
      return (
        <EmptyState
          view="tasks"
          isConnected={isConnected}
          hasTasks={Object.keys(tasks).length > 0}
          waitingTasks={waitingTasks}
        />
      )
    }

    if (activeView === 'projects') {
      if (selectedProject) {
        return (
          <ProjectEditor
            project={selectedProject}
            onUpdate={updateProject}
            onDelete={deleteProject}
          />
        )
      }
      return (
        <EmptyState view="projects" isConnected={isConnected} hasTasks={false} waitingTasks={0} />
      )
    }

    if (activeView === 'integrations') {
      if (
        integrationName &&
        (integrationName === 'github' ||
          integrationName === 'linear' ||
          integrationName === 'slack')
      ) {
        return (
          <IntegrationDetail
            name={integrationName}
            config={config}
            secrets={secrets}
            onSetSecret={setSecret}
            onSaveSlack={saveSlack}
            onRemoveSlack={removeSlack}
          />
        )
      }
      return (
        <EmptyState
          view="integrations"
          isConnected={isConnected}
          hasTasks={false}
          waitingTasks={0}
        />
      )
    }

    if (activeView === 'secrets') {
      return (
        <SecretsEditor secrets={secrets} onSetSecret={setSecret} onDeleteSecret={deleteSecret} />
      )
    }

    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#060606]">
      {/* Left icon nav */}
      <NavBar
        activeView={activeView}
        onViewChange={handleViewChange}
        isConnected={isConnected}
      />

      {/* List panel */}
      <ListPanel
        selectedId={selectedSidebarId}
        onSelectItem={handleSelectItem}
        activeView={activeView}
        onAddProject={() => setShowAddProject(true)}
        tasks={Object.values(tasks)}
        config={config}
        secrets={secrets}
      />

      {/* Main content */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {mainContent()}
      </main>

      <OrchestratorErrorOverlay errors={orchestratorErrors} />

      {showAddProject && (
        <AddProjectWizard
          existingIds={config?.projects.map((p) => p.id) ?? []}
          onAdd={createProject}
          onClose={() => setShowAddProject(false)}
        />
      )}
    </div>
  )
}

export default Index
