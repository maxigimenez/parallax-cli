import { simpleGit, SimpleGit } from 'simple-git'
import { Task, ProjectConfig } from '@parallax/common'
import { HostExecutor } from '@parallax/common/executor'
import fs from 'fs/promises'
import path from 'path'
import { PARALLAX_MANAGED_LABEL } from './github/constants.js'
import {
  buildDefaultCommitMessage,
  normalizePrSummary,
  sanitizeCommitMessage,
} from './ai-adapters/execution-metadata.js'

export class GitService {
  constructor(private executor: HostExecutor) {}

  async getWorktreeChangedFiles(
    worktreePath: string
  ): Promise<Array<{ path: string; status: 'A' | 'M' | 'D' | 'R' }>> {
    const result = await this.executor.executeCommand(['git', 'status', '--porcelain'], {
      cwd: worktreePath,
    })
    if (result.exitCode !== 0) {
      throw new Error(`git status failed while reading worktree changes: ${result.output}`)
    }

    const files = new Map<string, 'A' | 'M' | 'D' | 'R'>()
    const lines = (result.output || '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)

    for (const line of lines) {
      if (line.length < 3) {
        continue
      }

      const code = line.slice(0, 2)
      const rest = line.slice(3).trim()
      const statusCode = code[0] === '?' ? '?' : code[0] === ' ' ? code[1] : code[0]

      if (statusCode === 'R' && rest.includes(' -> ')) {
        const [, toPath] = rest.split(' -> ')
        if (toPath) {
          files.set(toPath.trim(), 'R')
        }
        continue
      }

      const normalizedStatus: 'A' | 'M' | 'D' | 'R' =
        statusCode === 'A' || statusCode === '?'
          ? 'A'
          : statusCode === 'D'
            ? 'D'
            : statusCode === 'R'
              ? 'R'
              : 'M'
      files.set(rest, normalizedStatus)
    }

    return Array.from(files.entries()).map(([path, status]) => ({ path, status }))
  }

  async getWorktreeFileDiff(worktreePath: string, filePath: string): Promise<string> {
    const diffResult = await this.executor.executeCommand(['git', 'diff', '--', filePath], {
      cwd: worktreePath,
    })
    if (diffResult.exitCode !== 0) {
      throw new Error(`git diff failed for ${filePath}: ${diffResult.output}`)
    }

    if (diffResult.output.trim()) {
      return diffResult.output
    }

    const stagedResult = await this.executor.executeCommand(
      ['git', 'diff', '--staged', '--', filePath],
      {
        cwd: worktreePath,
      }
    )
    if (stagedResult.exitCode !== 0) {
      throw new Error(`git diff --staged failed for ${filePath}: ${stagedResult.output}`)
    }

    if (stagedResult.output.trim()) {
      return stagedResult.output
    }

    const noIndexResult = await this.executor.executeCommand(
      ['git', 'diff', '--no-index', '--', '/dev/null', filePath],
      {
        cwd: worktreePath,
      }
    )

    if (noIndexResult.output.trim()) {
      return noIndexResult.output
    }

    return ''
  }

  async getTaskUnifiedDiff(project: ProjectConfig, task: Task): Promise<string> {
    if (task.prNumber) {
      const result = await this.executor.executeCommand(
        ['gh', 'pr', 'diff', String(task.prNumber)],
        { cwd: project.workspaceDir }
      )

      if (result.exitCode !== 0) {
        throw new Error(`GitHub CLI failed while fetching PR diff: ${result.output}`)
      }

      return result.output || ''
    }

    if (!task.branchName) {
      throw new Error(`Task ${task.externalId} has no branch or PR context for diff retrieval.`)
    }

    const fetchResult = await this.executor.executeCommand(
      ['git', 'fetch', 'origin', 'main', task.branchName],
      { cwd: project.workspaceDir }
    )
    if (fetchResult.exitCode !== 0) {
      throw new Error(`git fetch failed while preparing diff: ${fetchResult.output}`)
    }

    const diffResult = await this.executor.executeCommand(
      ['git', 'diff', `origin/main...origin/${task.branchName}`],
      { cwd: project.workspaceDir }
    )
    if (diffResult.exitCode !== 0) {
      throw new Error(`git diff failed while fetching branch diff: ${diffResult.output}`)
    }

    return diffResult.output || ''
  }

  private async ensureManagedLabelExists(worktreePath: string): Promise<void> {
    const result = await this.executor.executeCommand(
      [
        'gh',
        'label',
        'create',
        PARALLAX_MANAGED_LABEL,
        '--color',
        '0e8a16',
        '--description',
        'PRs actively managed by Parallax',
      ],
      {
        cwd: worktreePath,
        env: { GITHUB_TOKEN: undefined, GH_TOKEN: undefined },
      }
    )

    if (result.exitCode === 0 || result.output.toLowerCase().includes('already exists')) {
      return
    }

    throw new Error(`GitHub CLI failed while ensuring managed label exists: ${result.output}`)
  }

  async syncMainBranch(repoPath: string): Promise<void> {
    const git: SimpleGit = simpleGit(repoPath)
    const currentBranch = (await git.status()).current

    try {
      if (currentBranch && currentBranch !== 'main') {
        await git.checkout('main')
      }

      await git.raw(['pull', '--ff-only', 'origin', 'main'])
    } finally {
      if (currentBranch && currentBranch !== 'main') {
        await git.checkout(currentBranch)
      }
    }
  }

  async createWorktree(task: Task, project: ProjectConfig, tempBaseDir: string): Promise<string> {
    if (task.branchName) {
      return this.createWorktreeForExistingBranch(task, project, tempBaseDir)
    }

    const git: SimpleGit = simpleGit(project.workspaceDir)
    const worktreePath = path.join(tempBaseDir, task.externalId)
    const branchName = `task/${task.externalId.toLowerCase()}`

    await fs.mkdir(tempBaseDir, { recursive: true })

    try {
      await fs.access(worktreePath)
      await git.raw(['worktree', 'remove', '--force', worktreePath])
    } catch {
      // Ignore
    }

    try {
      await git.branch(['-D', branchName])
    } catch {
      // Ignore
    }

    await git.raw(['worktree', 'add', '-b', branchName, worktreePath, 'main'])

    return worktreePath
  }

  async createWorktreeForExistingBranch(
    task: Task,
    project: ProjectConfig,
    tempBaseDir: string
  ): Promise<string> {
    if (!task.branchName) {
      throw new Error(`Task ${task.externalId} does not have a stored branch name.`)
    }

    const git: SimpleGit = simpleGit(project.workspaceDir)
    const worktreePath = path.join(tempBaseDir, task.externalId)
    const localBranchName = `${task.branchName}-parallax-${task.id.slice(0, 8)}`

    await fs.mkdir(tempBaseDir, { recursive: true })

    try {
      await fs.access(worktreePath)
      await git.raw(['worktree', 'remove', '--force', worktreePath])
    } catch {
      // Ignore
    }

    await git.fetch('origin', task.branchName)

    try {
      await git.raw(['branch', '-D', localBranchName])
    } catch {
      // Ignore
    }

    await git.raw([
      'worktree',
      'add',
      '-B',
      localBranchName,
      worktreePath,
      `origin/${task.branchName}`,
    ])

    return worktreePath
  }

  async mergeMainIntoBranch(worktreePath: string): Promise<{ conflicted: boolean }> {
    const git: SimpleGit = simpleGit(worktreePath)

    await git.fetch('origin', 'main')

    try {
      await git.raw(['merge', '--no-edit', 'origin/main'])
      return { conflicted: false }
    } catch (error) {
      const status = await git.status()
      if (status.conflicted.length > 0) {
        return { conflicted: true }
      }

      throw error
    }
  }

  async fastForwardBranchToMain(worktreePath: string): Promise<void> {
    const git: SimpleGit = simpleGit(worktreePath)

    await git.fetch('origin', 'main')
    await git.raw(['merge', '--ff-only', 'origin/main'])
  }

  async commitAndPush(
    worktreePath: string,
    task: Task,
    options?: { commitMessage?: string }
  ): Promise<string | null> {
    const git: SimpleGit = simpleGit(worktreePath)
    const remoteBranchName = task.branchName || `task/${task.externalId.toLowerCase()}`

    const status = await git.status()
    if (status.isClean()) {
      return null
    }

    await git.add('.')
    await git.commit(
      sanitizeCommitMessage(options?.commitMessage) ??
        buildDefaultCommitMessage(task.externalId, task.title)
    )
    await git.raw(['push', 'origin', `HEAD:${remoteBranchName}`, '--set-upstream'])

    return remoteBranchName
  }

  async removeWorktree(worktreePath: string, repoPath: string): Promise<void> {
    const git: SimpleGit = simpleGit(repoPath)
    try {
      await git.raw(['worktree', 'remove', '--force', worktreePath])
      await git.raw(['worktree', 'prune'])
    } catch (e) {
      console.warn(`Failed to remove worktree at ${worktreePath}:`, e)
    }
  }

  async createPullRequest(
    worktreePath: string,
    task: Task,
    options?: { prTitle?: string; prSummary?: string }
  ): Promise<string> {
    await this.ensureManagedLabelExists(worktreePath)

    const reviewerTitle = (options?.prTitle || task.title).replace(/\s+/g, ' ').trim()
    const title = `[Parallax] ${task.externalId}: ${reviewerTitle}`

    const summary = normalizePrSummary(options?.prSummary)
    const body = [
      `This PR was automatically generated by Parallax to resolve task ${task.externalId}.`,
      '',
      '### AI Change Summary',
      summary || '- No AI summary was provided.',
      '',
      '### Task Description',
      task.description || 'No task description provided.',
    ].join('\n')

    // NOTE: Removed literal quotes from arguments because we use shell: false
    const result = await this.executor.executeCommand(
      [
        'gh',
        'pr',
        'create',
        '--title',
        title,
        '--body',
        body,
        '--base',
        'main',
        '--label',
        PARALLAX_MANAGED_LABEL,
      ],
      {
        cwd: worktreePath,
        // Force gh to use its own authenticated host session for PR creation.
        env: { GITHUB_TOKEN: undefined, GH_TOKEN: undefined },
      }
    )

    if (result.exitCode !== 0) {
      if (result.output.includes('Resource not accessible by personal access token')) {
        throw new Error(
          'GitHub CLI could not create the PR because the current GitHub authentication does not have pull request permissions. Re-authenticate with `gh auth login` using repo access.'
        )
      }
      throw new Error(`GitHub CLI failed: ${result.output}`)
    }

    const match = result.output.match(/https:\/\/github\.com\/[^\s]+/)
    return match ? match[0] : 'PR Created (See gh CLI output)'
  }
}
