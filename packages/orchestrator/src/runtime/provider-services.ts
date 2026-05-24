import { PULL_PROVIDER, ProjectConfig, Task } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import { GitHubService, TaskWithLabels } from '../github/service.js'
import { LinearService } from '../linear/service.js'
import { requireGitHubRepoDetails } from '../github/repository.js'

export type { TaskWithLabels }

export type ExternalServices = {
  linearService?: LinearService
  githubService?: GitHubService
}

export function buildExternalServices(
  executor: HostExecutor,
  options: {
    requiresGitHub: boolean
    linearApiKey?: string
  }
): ExternalServices {
  return {
    linearService: options.linearApiKey ? new LinearService(options.linearApiKey) : undefined,
    githubService: options.requiresGitHub ? new GitHubService(executor) : undefined,
  }
}

function getPullProvider(project: ProjectConfig) {
  return project.pullFrom.provider
}

export async function fetchProjectTasks(
  project: ProjectConfig,
  services: ExternalServices
): Promise<TaskWithLabels[]> {
  const provider = getPullProvider(project)

  if (provider === PULL_PROVIDER.LINEAR) {
    if (!services.linearService) {
      throw new Error('LINEAR_API_KEY missing from environment.')
    }
    return services.linearService.fetchNewIssues(project)
  }

  if (!services.githubService) {
    throw new Error('GitHub CLI not configured.')
  }

  return services.githubService.fetchNewIssues(project)
}

export async function markTaskInProgress(
  task: Task,
  project: ProjectConfig,
  services: ExternalServices,
  body?: string
): Promise<string | undefined> {
  const provider = getPullProvider(project)
  const existingCommentId = task.trackerCommentId ?? null

  if (provider === PULL_PROVIDER.LINEAR) {
    if (!services.linearService) {
      throw new Error('LINEAR_API_KEY missing from environment.')
    }
    return services.linearService.markAsInProgress(task.externalId, existingCommentId, body)
  }

  if (!services.githubService) {
    throw new Error('GitHub CLI not configured.')
  }

  return services.githubService.markAsInProgress(task.externalId, project, existingCommentId, body)
}

export async function updateProviderComment(
  task: Task,
  project: ProjectConfig,
  services: ExternalServices,
  message: string
): Promise<void> {
  if (!task.trackerCommentId) {
    return
  }

  const provider = getPullProvider(project)

  if (provider === PULL_PROVIDER.LINEAR) {
    if (!services.linearService) return
    await services.linearService.updateComment(task.trackerCommentId, message).catch(() => {})
    return
  }

  if (!services.githubService) return
  const { owner, repo } = requireGitHubRepoDetails(project)
  await services.githubService
    .updateComment(owner, repo, task.trackerCommentId, message, project)
    .catch(() => {})
}
