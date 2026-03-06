import { useMemo } from 'react';
import { TaskSidebar } from '@/components/TaskSidebar';
import { LogViewer } from '@/components/LogViewer';
import { SettingsViewer } from '@/components/SettingsViewer';
import { EmptyState } from '@/components/EmptyState';
import { useParallax } from '@/hooks/useParallax';
import { TASK_STATUS } from '@/lib/task-constants';
import { useSearchParams } from 'react-router-dom';

const Index = () => {
  const {
    tasks,
    config,
    isConnected,
    retryTask,
    cancelTask,
    approvePlan,
    rejectPlan,
  } = useParallax();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeView = (searchParams.get('view') === 'settings' ? 'settings' : 'tasks') as
    | 'tasks'
    | 'settings';
  const selectedTaskId = searchParams.get('task');
  const rawTab = searchParams.get('tab');
  const activeTab = rawTab === 'logs' || rawTab === 'plan' ? rawTab : 'summary';

  const handleSelectTask = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('task', id);
    if (!next.get('tab')) {
      next.set('tab', 'summary');
    }
    setSearchParams(next, { replace: true });
  };

  const handleViewChange = (view: 'tasks' | 'settings') => {
    const next = new URLSearchParams(searchParams);
    next.set('view', view);
    next.delete('task');
    next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (tab: 'summary' | 'logs' | 'plan') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const safeSelectedTaskId = useMemo(() => {
    if (!selectedTaskId) {
      return null;
    }

    if (selectedTaskId.startsWith('project-')) {
      return selectedTaskId;
    }

    return tasks[selectedTaskId] ? selectedTaskId : null;
  }, [selectedTaskId, tasks]);

  return (
    <div className="h-screen flex overflow-hidden bg-[#060606]">
      <div className="flex-1 flex min-h-0 min-w-0 flex-col">
        {activeView === 'tasks' && safeSelectedTaskId && !safeSelectedTaskId.startsWith('project-') ? (
          <LogViewer
            taskId={safeSelectedTaskId}
            title={tasks[safeSelectedTaskId]?.title}
            msg={tasks[safeSelectedTaskId]?.msg}
            description={tasks[safeSelectedTaskId]?.description}
            projectId={tasks[safeSelectedTaskId]?.projectId}
            logs={tasks[safeSelectedTaskId]?.logs || []}
            status={tasks[safeSelectedTaskId]?.status || 'queued'}
            branchName={tasks[safeSelectedTaskId]?.branchName}
            prUrl={tasks[safeSelectedTaskId]?.prUrl}
            prNumber={tasks[safeSelectedTaskId]?.prNumber}
            lastReviewEventAt={tasks[safeSelectedTaskId]?.lastReviewEventAt}
            reviewState={tasks[safeSelectedTaskId]?.reviewState}
            planState={tasks[safeSelectedTaskId]?.planState}
            planMarkdown={tasks[safeSelectedTaskId]?.planMarkdown}
            planPrompt={tasks[safeSelectedTaskId]?.planPrompt}
            planResult={tasks[safeSelectedTaskId]?.planResult}
            config={config}
            onRetry={retryTask}
            onCancel={cancelTask}
            onApprovePlan={approvePlan}
            onRejectPlan={rejectPlan}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (activeView === 'settings' || safeSelectedTaskId?.startsWith('project-')) && safeSelectedTaskId ? (
          <SettingsViewer projectIndex={parseInt(safeSelectedTaskId.replace('project-', ''))} config={config} />
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
        selectedTaskId={safeSelectedTaskId}
        onSelectTask={handleSelectTask}
        activeView={activeView}
        onViewChange={handleViewChange}
        tasks={Object.values(tasks)}
        config={config}
        isConnected={isConnected}
      />
    </div>
  );
};

export default Index;
