import { Octokit } from '@octokit/rest'
import { useConfig } from './useConfig'

export interface FetchedFile {
  content: string
  sha: string
  path: string
}

export interface UpdateResult {
  commitSha: string
  /** 文件的新 sha（用于下一次写入），不是 commit 的 sha */
  contentSha: string
  htmlUrl: string
  version: string
}

/**
 * Generate the next semantic version based on the last commit message for the file.
 * Looks for a tag like [v1.2.3] and bumps the patch number.
 * Falls back to v1.0.0 when no previous version is found.
 */
async function resolveNextVersion(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string> {
  try {
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      path,
      per_page: 5,
    })
    const versionRegex = /\[v(\d+)\.(\d+)\.(\d+)\]/
    for (const c of commits) {
      const msg = c.commit.message ?? ''
      const m = msg.match(versionRegex)
      if (m) {
        const major = Number(m[1])
        const minor = Number(m[2])
        const patch = Number(m[3]) + 1
        return `${major}.${minor}.${patch}`
      }
    }
  } catch {
    // If listing commits fails (e.g. empty repo / no history), fall through.
  }
  return '1.0.0'
}

function createOctokit(): Octokit {
  const { pat } = useConfig()
  if (!pat.value) {
    throw new Error('GitHub PAT 未配置，请先在设置中填写。')
  }
  return new Octokit({ auth: pat.value })
}

/**
 * Core GitHub service that talks directly to the repository's content API.
 * All writes use the single-file Contents PUT endpoint which requires only
 * "Contents: Read and write" permission on the PAT.
 */
export const githubService = {
  /**
   * Read a file's content (UTF-8 decoded) together with its current sha.
   */
  async fetchFile(path: string): Promise<FetchedFile> {
    const { owner, repo, branch } = useConfig()
    if (!owner.value || !repo.value) {
      throw new Error('仓库信息未配置。')
    }
    const octokit = createOctokit()
    const { data } = await octokit.rest.repos.getContent({
      owner: owner.value,
      repo: repo.value,
      path,
      ref: branch.value,
    })

    // API may return an array for directory paths; we only handle files here.
    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`路径 ${path} 不是文件，无法读取。`)
    }

    // data.encoding is usually "base64"
    const content =
      data.encoding === 'base64'
        ? decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))))
        : data.content

    return { content, sha: data.sha, path }
  },

  /**
   * Update (or create) a file. Generates a version tag and appends it to the
   * commit message, e.g. "Update: 打卡京都金阁寺 [v1.2.0]".
   */
  async updateFile(
    path: string,
    content: string,
    sha: string,
    commitMessage: string,
  ): Promise<UpdateResult> {
    const { owner, repo, branch } = useConfig()
    if (!owner.value || !repo.value) {
      throw new Error('仓库信息未配置。')
    }
    const octokit = createOctokit()

    const version = await resolveNextVersion(
      octokit,
      owner.value,
      repo.value,
      branch.value,
      path,
    )
    const message = `${commitMessage} [v${version}]`

    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner: owner.value,
      repo: repo.value,
      path,
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha,
      branch: branch.value,
    })

    return {
      commitSha: data.commit.sha ?? '',
      contentSha: data.content?.sha ?? '',
      htmlUrl: data.commit.html_url ?? '',
      version,
    }
  },

  /**
   * Lightweight connectivity / permission check. Verifies the PAT can read
   * the configured repository.
   */
  async verifyAccess(): Promise<boolean> {
    const { owner, repo } = useConfig()
    if (!owner.value || !repo.value) return false
    const octokit = createOctokit()
    await octokit.rest.repos.get({
      owner: owner.value,
      repo: repo.value,
    })
    return true
  },
}
