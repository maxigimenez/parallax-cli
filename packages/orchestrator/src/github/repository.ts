import { PULL_PROVIDER, ProjectConfig } from '@parallax/common'

export function requireGitHubRepoDetails(project: ProjectConfig) {
  if (project.pullFrom.provider !== PULL_PROVIDER.GITHUB) {
    throw new Error(`Project "${project.id}" is not configured to pull from GitHub.`)
  }

  const { owner, repo } = project.pullFrom.filters

  if (!owner || !repo) {
    throw new Error(
      `GitHub provider for project "${project.id}" requires pullFrom.filters.owner and pullFrom.filters.repo`
    )
  }

  return { owner, repo }
}

export function parseGitHubIssueNumber(externalId: string): number {
  const match = externalId.match(/#(\d+)$/)
  if (!match) {
    throw new Error(`Unable to parse GitHub issue number from external ID "${externalId}"`)
  }

  return Number.parseInt(match[1], 10)
}
