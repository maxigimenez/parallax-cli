import { PULL_PROVIDER, ProjectConfig, Task } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import { GitHubService } from '../github/service.js'
import { LinearService } from '../linear/service.js'

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
): Promise<Task[]> {
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
  services: ExternalServices
) {
  const provider = getPullProvider(project)

  if (provider === PULL_PROVIDER.LINEAR) {
    if (!services.linearService) {
      throw new Error('LINEAR_API_KEY missing from environment.')
    }
    await services.linearService.markAsInProgress(task.externalId)
    return
  }

  if (!services.githubService) {
    throw new Error('GitHub CLI not configured.')
  }

  await services.githubService.markAsInProgress(task.externalId, project)
}
