import {
  COMMENT_TARGET,
  TICKET_PROVIDER,
  TRIGGER_TYPE,
  type CommentTarget,
  type ProjectConfig,
  type TriggerEvent,
} from '@sentinel0/common'
import type { LocalExecutor } from '@sentinel0/common/executor'
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
  assignees?: Array<{ login?: string }>
}

interface PullRequestSummary extends IssueSummary {
  reviewRequests?: Array<{ login?: string; name?: string; slug?: string }>
  assignees?: Array<{ login?: string }>
  isDraft?: boolean
  baseRefName?: string
}

/** Orange, matching Sentinel0's own colour, so managed labels read as a set. */
const SENTINEL0_LABEL_COLOR = 'f97316'

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
      this.collectPullRequests(project),
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
      'number,title,body,url,state,updatedAt,labels,assignees',
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
      assignees: logins(issue.assignees),
    }))
  }

  /**
   * Every open pull request, as both a general `pr_event` and — when someone is
   * actually awaiting review — a `pr_review_requested`.
   *
   * The general event is emitted unconditionally. Previously PRs were only
   * looked at when a reviewer had been requested, so a route keyed on a label
   * or an assignee never saw the pull request at all.
   */
  private async collectPullRequests(project: ProjectConfig): Promise<TriggerEvent[]> {
    const { owner, repo } = requireRepo(project)

    const pulls = JSON.parse(
      (await this.gh([
        'pr',
        'list',
        '--repo',
        `${owner}/${repo}`,
        '--json',
        'number,title,body,url,state,updatedAt,labels,assignees,reviewRequests,isDraft,baseRefName',
        '--limit',
        '100',
        '--state',
        'open',
      ])) || '[]'
    ) as PullRequestSummary[]

    const events: TriggerEvent[] = []

    for (const pull of pulls) {
      const reviewers = reviewerLogins(pull)
      const base = {
        projectId: project.id,
        provider: TICKET_PROVIDER.GITHUB,
        ref: `${owner}/${repo}#${pull.number}`,
        title: pull.title,
        body: pull.body ?? '',
        url: pull.url,
        state: pull.state,
        labels: pull.labels?.map((label) => label.name) ?? [],
        assignees: logins(pull.assignees),
        prNumber: pull.number,
        requestedReviewers: reviewers,
        isDraft: pull.isDraft,
        baseBranch: pull.baseRefName,
      }

      events.push({
        ...base,
        type: TRIGGER_TYPE.PR_EVENT,
        // Assignee and reviewer sets are not reliably reflected in updatedAt,
        // so they are folded in: adding someone must count as a change.
        revision: [
          pull.updatedAt ?? '',
          base.assignees.slice().sort().join(','),
          reviewers.slice().sort().join(','),
          base.labels.slice().sort().join(','),
        ].join('|'),
      })

      if (reviewers.length > 0) {
        events.push({
          ...base,
          type: TRIGGER_TYPE.PR_REVIEW_REQUESTED,
          revision: `${pull.updatedAt ?? ''}|${reviewers.slice().sort().join(',')}`,
        })
      }
    }

    return events
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

  /**
   * Creates a label if the repository does not have it.
   *
   * `gh issue edit --add-label` fails outright on an unknown label, so the
   * `sentinel0:` markers would never apply to a repository that has not seen
   * them before -- and the loop guard that depends on them would quietly not
   * work. Already-exists is the expected case and is not an error.
   */
  private async ensureLabel(owner: string, repo: string, label: string): Promise<void> {
    const result = await this.executor.executeCommand(
      [
        'gh',
        'label',
        'create',
        label,
        '--repo',
        `${owner}/${repo}`,
        '--color',
        SENTINEL0_LABEL_COLOR,
        '--description',
        'Managed by Sentinel0',
      ],
      { cwd: process.cwd() }
    )

    if (result.exitCode !== 0 && !/already exists/i.test(result.output)) {
      throw new Error(`Could not create label "${label}": ${result.output.trim()}`)
    }
  }

  async updateLabels(
    event: TriggerEvent,
    labels: { add?: string[]; remove?: string[] }
  ): Promise<void> {
    const { owner, repo } = splitRef(event.ref)
    const number = parseIssueNumber(event.ref)

    const toAdd = labels.add ?? []
    const toRemove = labels.remove ?? []
    if (toAdd.length === 0 && toRemove.length === 0) {
      return
    }

    for (const label of toAdd) {
      await this.ensureLabel(owner, repo, label)
    }

    const args = ['issue', 'edit', String(number), '--repo', `${owner}/${repo}`]
    for (const label of toAdd) {
      args.push('--add-label', label)
    }
    for (const label of toRemove) {
      args.push('--remove-label', label)
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

function logins(users?: Array<{ login?: string }>): string[] {
  return (users ?? []).map((user) => user.login).filter((login): login is string => Boolean(login))
}

export function splitRef(ref: string): { owner: string; repo: string } {
  const match = ref.match(/^([^/]+)\/([^#]+)#\d+$/)
  if (!match) {
    throw new Error(`Malformed GitHub ref "${ref}"; expected owner/repo#number.`)
  }
  return { owner: match[1], repo: match[2] }
}
