import {
  COMMENT_TARGET,
  TICKET_PROVIDER,
  TRIGGER_TYPE,
  type CommentTarget,
  type ProjectConfig,
  type TriggerEvent,
} from '@parallax/common'
import type { LocalExecutor } from '@parallax/common/executor'
import type { TrackerWriter, TriggerSource } from '../triggers/types.js'

export function requireRepo(project: ProjectConfig): { owner: string; repo: string } {
  if (project.provider !== TICKET_PROVIDER.GITHUB) {
    throw new Error(`Project "${project.id}" is not configured to pull from GitHub.`)
  }
  const { owner, repo } = project.filters
  if (!owner || !repo) {
    throw new Error(`GitHub project "${project.id}" requires filters.owner and filters.repo.`)
  }
  return { owner, repo }
}

export function parseIssueNumber(ref: string): number {
  const match = ref.match(/#(\d+)$/)
  if (!match) {
    throw new Error(`Unable to parse an issue or PR number from "${ref}".`)
  }
  return Number.parseInt(match[1], 10)
}

interface IssueSummary {
  number: number
  title: string
  body?: string | null
  url?: string
  state?: string
  updatedAt?: string
  labels?: Array<{ name: string }>
}

interface PullRequestSummary extends IssueSummary {
  reviewRequests?: Array<{ login?: string; name?: string; slug?: string }>
}

export class GitHubService implements TriggerSource, TrackerWriter {
  readonly name = 'github'

  constructor(private readonly executor: LocalExecutor) {}

  private async gh(args: string[]): Promise<string> {
    const result = await this.executor.executeCommand(['gh', ...args], { cwd: process.cwd() })

    if (result.exitCode === 127) {
      throw new Error('GitHub CLI not found. Install it and run "gh auth login".')
    }
    if (result.exitCode !== 0) {
      throw new Error(`gh ${args[0]} ${args[1] ?? ''} failed: ${result.output.trim()}`)
    }
    return result.output
  }

  // ── Trigger source ─────────────────────────────────────────

  async collect(project: ProjectConfig): Promise<TriggerEvent[]> {
    if (project.provider !== TICKET_PROVIDER.GITHUB) {
      return []
    }
    const [issues, pullRequests] = await Promise.all([
      this.collectIssues(project),
      this.collectReviewRequests(project),
    ])
    return [...issues, ...pullRequests]
  }

  private async collectIssues(project: ProjectConfig): Promise<TriggerEvent[]> {
    const { owner, repo } = requireRepo(project)
    const { state = 'open', labels } = project.filters

    const args = [
      'issue',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--json',
      'number,title,body,url,state,updatedAt,labels',
      '--limit',
      '100',
      '--state',
      state,
    ]
    // gh ANDs repeated --label, which is the narrowing behaviour we want here:
    // this filter is a coarse pre-filter, and routes do the real matching.
    for (const label of labels ?? []) {
      args.push('--label', label)
    }

    const issues = JSON.parse((await this.gh(args)) || '[]') as IssueSummary[]

    return issues.map((issue) => ({
      type: TRIGGER_TYPE.TICKET,
      projectId: project.id,
      provider: TICKET_PROVIDER.GITHUB,
      ref: `${owner}/${repo}#${issue.number}`,
      // updatedAt is GitHub's own "has this changed" signal, which makes it the
      // natural revision: relabel or edit a ticket and the route fires again;
      // leave it alone and every later poll is a no-op.
      revision: issue.updatedAt ?? '',
      title: issue.title,
      body: issue.body ?? '',
      url: issue.url,
      state: issue.state,
      labels: issue.labels?.map((label) => label.name) ?? [],
    }))
  }

  private async collectReviewRequests(project: ProjectConfig): Promise<TriggerEvent[]> {
    const { owner, repo } = requireRepo(project)

    const pulls = JSON.parse(
      (await this.gh([
        'pr',
        'list',
        '--repo',
        `${owner}/${repo}`,
        '--json',
        'number,title,body,url,state,updatedAt,labels,reviewRequests',
        '--limit',
        '100',
        '--state',
        'open',
      ])) || '[]'
    ) as PullRequestSummary[]

    return pulls
      .filter((pull) => (pull.reviewRequests?.length ?? 0) > 0)
      .map((pull) => ({
        type: TRIGGER_TYPE.PR_REVIEW_REQUESTED,
        projectId: project.id,
        provider: TICKET_PROVIDER.GITHUB,
        ref: `${owner}/${repo}#${pull.number}`,
        // Reviewer sets are not reflected in updatedAt reliably, so the set
        // itself is folded into the revision: adding an agent as a reviewer
        // must re-fire even when nothing else about the PR changed.
        revision: `${pull.updatedAt ?? ''}|${reviewerLogins(pull).sort().join(',')}`,
        title: pull.title,
        body: pull.body ?? '',
        url: pull.url,
        state: pull.state,
        labels: pull.labels?.map((label) => label.name) ?? [],
        prNumber: pull.number,
        requestedReviewers: reviewerLogins(pull),
      }))
  }

  /** Fetches a PR's diff, for feeding a reviewer agent that needs the change itself. */
  async getPullRequestDiff(project: ProjectConfig, prNumber: number): Promise<string> {
    const { owner, repo } = requireRepo(project)
    return this.gh(['pr', 'diff', String(prNumber), '--repo', `${owner}/${repo}`])
  }

  // ── Tracker writer ─────────────────────────────────────────

  async postComment(_target: CommentTarget, event: TriggerEvent, body: string): Promise<void> {
    const { owner, repo } = splitRef(event.ref)
    const number = parseIssueNumber(event.ref)

    // Issues and PRs share the issues comment endpoint on GitHub, so both
    // comment targets resolve to the same call.
    await this.gh([
      'api',
      `repos/${owner}/${repo}/issues/${number}/comments`,
      '-X',
      'POST',
      '-F',
      `body=${body}`,
    ])
  }

  async updateLabels(
    event: TriggerEvent,
    labels: { add?: string[]; remove?: string[] }
  ): Promise<void> {
    const { owner, repo } = splitRef(event.ref)
    const number = parseIssueNumber(event.ref)
    const args = ['issue', 'edit', String(number), '--repo', `${owner}/${repo}`]

    for (const label of labels.add ?? []) {
      args.push('--add-label', label)
    }
    for (const label of labels.remove ?? []) {
      args.push('--remove-label', label)
    }
    if (args.length === 5) {
      return
    }
    await this.gh(args)
  }
}

export const COMMENT_TARGETS_HANDLED: CommentTarget[] = [COMMENT_TARGET.TICKET, COMMENT_TARGET.PR]

function reviewerLogins(pull: PullRequestSummary): string[] {
  return (pull.reviewRequests ?? [])
    .map((request) => request.login ?? request.slug ?? request.name)
    .filter((login): login is string => Boolean(login))
}

export function splitRef(ref: string): { owner: string; repo: string } {
  const match = ref.match(/^([^/]+)\/([^#]+)#\d+$/)
  if (!match) {
    throw new Error(`Malformed GitHub ref "${ref}"; expected owner/repo#number.`)
  }
  return { owner: match[1], repo: match[2] }
}
