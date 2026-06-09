const {
  RELEASE_NOTES_FILENAME,
  buildReleaseNotesDocument,
  buildReleaseNotesFromPullRequest,
  extractChangelogEntry,
  extractOverflowBranchName,
  findMergedPendingOverflowPullRequest,
  getChangelogPath,
  getComponent,
  parseManifestVersionChanges,
  recoverReleasePleaseOverflowNotes,
} = require('./release-please-overflow-recovery-core.js');
const { execFileSync } = require('node:child_process');

class GitHubApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.data = data;
  }
}

class GitHubClient {
  constructor({ apiUrl, repository, token }) {
    this.apiUrl = (apiUrl || 'https://api.github.com').replace(/\/$/u, '');
    this.repository = repository;
    this.token = token;
  }

  async request(method, route, { allow404 = false, body, query } = {}) {
    const url = new URL(
      `${this.apiUrl}/repos/${this.repository}/${route.replace(/^\//u, '')}`
    );

    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      method,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (allow404 && response.status === 404) return undefined;

    if (!response.ok) {
      throw new GitHubApiError(
        data?.message || `GitHub API request failed: ${method} ${route}`,
        response.status,
        data
      );
    }

    return data;
  }

  async listClosedPullRequests(targetBranch, page) {
    return this.request('GET', '/pulls', {
      query: {
        base: targetBranch,
        direction: 'desc',
        page,
        per_page: 25,
        sort: 'updated',
        state: 'closed',
      },
    });
  }

  async getIssueLabels(number) {
    const issue = await this.request('GET', `/issues/${number}`);

    return (issue.labels || []).map((label) =>
      typeof label === 'string' ? label : label.name
    );
  }

  async getPullRequestFiles(number) {
    const files = [];

    for (let page = 1; page <= 10; page += 1) {
      const pageFiles = await this.request('GET', `/pulls/${number}/files`, {
        query: { page, per_page: 100 },
      });

      files.push(...pageFiles);
      if (pageFiles.length < 100) break;
    }

    return files;
  }

  async getJsonFile(filePath, ref) {
    return JSON.parse(await this.getTextFile(filePath, ref));
  }

  async getTextFile(filePath, ref, { allowMissing = false } = {}) {
    const file = await this.request(
      'GET',
      `/contents/${encodeRepoPath(filePath)}`,
      {
        allow404: allowMissing,
        query: { ref },
      }
    );

    if (!file) return undefined;
    if (Array.isArray(file) || file.type !== 'file') {
      throw new Error(`${filePath} is not a file on ${ref}`);
    }

    return Buffer.from(file.content, file.encoding || 'base64').toString(
      'utf8'
    );
  }

  async getBranchSha(branchName, { allowMissing = false } = {}) {
    const ref = await this.request(
      'GET',
      `/git/ref/heads/${encodeRefPath(branchName)}`,
      { allow404: allowMissing }
    );

    return ref?.object?.sha;
  }

  async createBranch(branchName, sha) {
    return this.request('POST', '/git/refs', {
      body: {
        ref: `refs/heads/${branchName}`,
        sha,
      },
    });
  }

  async createFile(filePath, branchName, content, message) {
    return this.request('PUT', `/contents/${encodeRepoPath(filePath)}`, {
      body: {
        branch: branchName,
        content: Buffer.from(content, 'utf8').toString('base64'),
        message,
      },
    });
  }
}

function encodeRepoPath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function encodeRefPath(refPath) {
  return refPath.split('/').map(encodeURIComponent).join('/');
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target-branch') args.targetBranch = argv[++index];
    else if (arg === '--config-file') args.configFile = argv[++index];
    else if (arg === '--manifest-file') args.manifestFile = argv[++index];
    else if (arg === '--repository') args.repository = argv[++index];
  }

  return args;
}

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repository = args.repository || process.env.GITHUB_REPOSITORY;
  const token = resolveToken();

  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');

  const result = await recoverReleasePleaseOverflowNotes({
    configFile: args.configFile,
    github: new GitHubClient({
      apiUrl: process.env.GITHUB_API_URL,
      repository,
      token,
    }),
    manifestFile: args.manifestFile,
    targetBranch: args.targetBranch,
  });

  console.log(`Release Please overflow recovery: ${result.status}`);
  if (result.branch) console.log(`Recovered branch: ${result.branch}`);
  if (result.pullRequestNumber) {
    console.log(`Release PR: #${result.pullRequestNumber}`);
  }
  if (result.reason) console.log(`Reason: ${result.reason}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  RELEASE_NOTES_FILENAME,
  GitHubApiError,
  GitHubClient,
  buildReleaseNotesDocument,
  buildReleaseNotesFromPullRequest,
  extractChangelogEntry,
  extractOverflowBranchName,
  findMergedPendingOverflowPullRequest,
  getChangelogPath,
  getComponent,
  parseManifestVersionChanges,
  recoverReleasePleaseOverflowNotes,
  resolveToken,
};
