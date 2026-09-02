import { TICKET_PROVIDER, type AppConfig, type ProjectConfig } from '@parallax/common'
import type { LocalExecutor } from '@parallax/common/executor'
import { GitHubService } from '../github/service.js'
import { LinearService } from '../linear/service.js'
import type { TrackerWriter, TriggerSource } from '../triggers/types.js'

export interface ProviderServices {
  github: GitHubService
  linear?: LinearService
}

export function buildProviderServices(
  config: AppConfig,
  executor: LocalExecutor
): ProviderServices {
  const needsLinear = config.projects.some((project) => project.provider === TICKET_PROVIDER.LINEAR)

  return {
    github: new GitHubService(executor),
    linear: needsLinear ? new LinearService(process.env.LINEAR_API_KEY ?? '') : undefined,
  }
}

function serviceFor(
  project: ProjectConfig,
  services: ProviderServices
): GitHubService | LinearService {
  if (project.provider === TICKET_PROVIDER.GITHUB) {
    return services.github
  }
  if (!services.linear) {
    throw new Error(
      `Project "${project.id}" pulls from Linear but LINEAR_API_KEY is not configured.`
    )
  }
  return services.linear
}

export function triggerSourceFor(
  project: ProjectConfig,
  services: ProviderServices
): TriggerSource {
  return serviceFor(project, services)
}

export function trackerWriterFor(
  project: ProjectConfig,
  services: ProviderServices
): TrackerWriter {
  return serviceFor(project, services)
}
