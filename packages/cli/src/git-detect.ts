import { execSync } from 'node:child_process'

export function detectGitHubRemote(workspaceDir: string): { owner: string; repo: string } | null {
  try {
    const url = execSync('git config --get remote.origin.url', {
      cwd: workspaceDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    // git@github.com:owner/repo.git OR https://github.com/owner/repo.git
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/)
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] }
    }

    const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/)
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] }
    }

    return null
  } catch {
    return null
  }
}
