import { AppConfig, PULL_PROVIDER } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'

export async function validateRuntimeRequirements(
  config: AppConfig,
  executor: HostExecutor
): Promise<void> {
  const requiresLinear = config.projects.some(
    (project) => project.pullFrom.provider === PULL_PROVIDER.LINEAR
  )
  const requiresGitHub = config.projects.length > 0

  if (requiresLinear && !process.env.LINEAR_API_KEY) {
    throw new Error('LINEAR_API_KEY missing from environment.')
  }

  if (!requiresGitHub) {
    return
  }

  const ghCheck = await executor.executeCommand(['gh', 'auth', 'status'], { cwd: process.cwd() })
  if (ghCheck.exitCode !== 0) {
    throw new Error('GitHub CLI is not authenticated. Run `gh auth login`.')
  }
}
