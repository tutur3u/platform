import type { InfrastructureProject } from '@tuturuuu/internal-api/infrastructure/monitoring';
import type { Sql } from 'postgres';

const GITHUB_API_ROOT = 'https://api.github.com';
const GITHUB_BRANCH_PAGE_SIZE = 100;
const GITHUB_BRANCH_PAGE_LIMIT = 100;
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;
const BRANCH_LIMIT_ERROR =
  'GitHub branch snapshot exceeds the 10,000 branch safety limit.';

export interface ParsedGitHubRepository {
  owner: string;
  repo: string;
  repoUrl: string;
}

interface GitHubRepositoryResponse {
  default_branch?: string;
  full_name?: string;
  html_url?: string;
  name?: string;
  owner?: {
    login?: string;
  };
  private?: boolean;
}

interface GitHubCommitResponse {
  commit?: {
    author?: {
      date?: string;
    };
    message?: string;
  };
  sha?: string;
}

export interface GitHubBranchSnapshotEntry {
  commitSha: string;
  name: string;
  protected: boolean;
}

export interface InfrastructureProjectGitHubSyncRow {
  repo_url: string;
  selected_branch: string;
}

interface ReconcileInfrastructureProjectGitHubOptions {
  fetchImpl?: typeof fetch;
  project: InfrastructureProjectGitHubSyncRow;
  projectId: string;
  reloadProject: (projectId: string) => Promise<InfrastructureProject | null>;
  sql: Sql;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return value == null || typeof value === 'string';
}

function isGitHubRepositoryResponse(
  value: unknown
): value is GitHubRepositoryResponse {
  if (!isObject(value)) {
    return false;
  }

  return (
    optionalString(value.default_branch) &&
    optionalString(value.full_name) &&
    optionalString(value.html_url) &&
    optionalString(value.name) &&
    (value.private == null || typeof value.private === 'boolean') &&
    (value.owner == null ||
      (isObject(value.owner) && optionalString(value.owner.login)))
  );
}

function parseGitHubBranchPage(value: unknown): GitHubBranchSnapshotEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('GitHub returned an invalid branch response.');
  }

  return value.map((branch) => {
    if (
      !isObject(branch) ||
      typeof branch.name !== 'string' ||
      branch.name.length === 0 ||
      !isObject(branch.commit) ||
      typeof branch.commit.sha !== 'string' ||
      branch.commit.sha.length === 0 ||
      typeof branch.protected !== 'boolean'
    ) {
      throw new Error('GitHub returned an invalid branch response.');
    }

    return {
      commitSha: branch.commit.sha,
      name: branch.name,
      protected: branch.protected,
    };
  });
}

function isGitHubCommitResponse(value: unknown): value is GitHubCommitResponse {
  if (!isObject(value)) {
    return false;
  }

  return (
    optionalString(value.sha) &&
    (value.commit == null ||
      (isObject(value.commit) &&
        optionalString(value.commit.message) &&
        (value.commit.author == null ||
          (isObject(value.commit.author) &&
            optionalString(value.commit.author.date)))))
  );
}

export function parsePublicGitHubRepoUrl(
  rawUrl: string
): ParsedGitHubRepository {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('GitHub repository URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid GitHub repository URL.');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new Error(
      'Only public https://github.com repositories are supported.'
    );
  }

  const [owner, repoSegment, ...rest] = parsed.pathname
    .split('/')
    .filter(Boolean);
  if (!owner || !repoSegment || rest.length > 0) {
    throw new Error('Use a repository URL like https://github.com/owner/repo.');
  }

  const repo = repoSegment.replace(/\.git$/i, '');
  if (!repo || repo.includes('/')) {
    throw new Error('Use a repository URL like https://github.com/owner/repo.');
  }

  return {
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}`,
  };
}

function getGitHubHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Tuturuuu-Platform',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchGitHubJson(
  url: string,
  fetchImpl: typeof fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: getGitHubHeaders(),
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('GitHub request failed.');
  }

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error('GitHub returned invalid JSON.');
  }
}

export async function fetchGitHubRepository(
  repo: ParsedGitHubRepository,
  fetchImpl: typeof fetch = fetch
) {
  const value = await fetchGitHubJson(
    `${GITHUB_API_ROOT}/repos/${repo.owner}/${repo.repo}`,
    fetchImpl
  );
  if (!isGitHubRepositoryResponse(value)) {
    throw new Error('GitHub returned an invalid repository response.');
  }
  if (value.private) {
    throw new Error('Private GitHub repositories are not supported in v1.');
  }

  const owner = value.owner?.login ?? repo.owner;
  const repoName = value.name ?? repo.repo;

  return {
    defaultBranch: value.default_branch || 'main',
    name: value.full_name ?? `${owner}/${repoName}`,
    owner,
    repo: repoName,
    repoUrl: value.html_url ?? repo.repoUrl,
  };
}

export async function fetchCompleteGitHubBranchSnapshot(
  repo: ParsedGitHubRepository,
  fetchImpl: typeof fetch = fetch
) {
  const branches = new Map<string, GitHubBranchSnapshotEntry>();

  for (let page = 1; page <= GITHUB_BRANCH_PAGE_LIMIT; page += 1) {
    const value = await fetchGitHubJson(
      `${GITHUB_API_ROOT}/repos/${repo.owner}/${repo.repo}/branches?per_page=${GITHUB_BRANCH_PAGE_SIZE}&page=${page}`,
      fetchImpl
    );
    const pageBranches = parseGitHubBranchPage(value);

    for (const branch of pageBranches) {
      const existing = branches.get(branch.name);
      if (
        existing &&
        (existing.commitSha !== branch.commitSha ||
          existing.protected !== branch.protected)
      ) {
        throw new Error('GitHub returned conflicting duplicate branch data.');
      }
      branches.set(branch.name, branch);
    }

    if (pageBranches.length < GITHUB_BRANCH_PAGE_SIZE) {
      return [...branches.values()];
    }
    if (page === GITHUB_BRANCH_PAGE_LIMIT) {
      throw new Error(BRANCH_LIMIT_ERROR);
    }
  }

  throw new Error(BRANCH_LIMIT_ERROR);
}

async function fetchGitHubCommit(
  repo: ParsedGitHubRepository,
  ref: string,
  fetchImpl: typeof fetch
): Promise<GitHubCommitResponse | null> {
  try {
    const value = await fetchGitHubJson(
      `${GITHUB_API_ROOT}/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(ref)}`,
      fetchImpl
    );
    if (!isGitHubCommitResponse(value)) {
      throw new Error('GitHub returned an invalid commit response.');
    }
    return value;
  } catch (error) {
    console.warn('Unable to sync GitHub commit metadata', {
      error: error instanceof Error ? error.message : String(error),
      ref,
      repo: repo.repoUrl,
    });
    return null;
  }
}

function normalizeBranch(value: string | null | undefined, fallback: string) {
  return (value ?? '').trim() || fallback;
}

function firstLine(value: string | null | undefined) {
  return value?.split('\n')[0]?.trim() || null;
}

function shortHash(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

export async function reconcileInfrastructureProjectGitHub({
  fetchImpl = fetch,
  project,
  projectId,
  reloadProject,
  sql,
}: ReconcileInfrastructureProjectGitHubOptions) {
  const parsed = parsePublicGitHubRepoUrl(project.repo_url);

  await sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(hashtextextended(${projectId}::text, 0))
    `;

    const [repository, branches] = await Promise.all([
      fetchGitHubRepository(parsed, fetchImpl),
      fetchCompleteGitHubBranchSnapshot(parsed, fetchImpl),
    ]);
    const selectedBranch = normalizeBranch(
      project.selected_branch,
      repository.defaultBranch
    );
    const selectedCommit = await fetchGitHubCommit(
      parsed,
      selectedBranch,
      fetchImpl
    );
    const selectedHash =
      selectedCommit?.sha ??
      branches.find((branch) => branch.name === selectedBranch)?.commitSha ??
      null;
    const selectedSubject = firstLine(selectedCommit?.commit?.message);
    const branchSnapshot = JSON.stringify(
      branches.map((branch) => {
        const commit = branch.name === selectedBranch ? selectedCommit : null;
        const commitHash = branch.commitSha || commit?.sha || null;
        return {
          commit_hash: commitHash,
          commit_short_hash: shortHash(commitHash),
          commit_subject: firstLine(commit?.commit?.message),
          committed_at: commit?.commit?.author?.date ?? null,
          default_branch: branch.name === repository.defaultBranch,
          name: branch.name,
          protected: branch.protected,
        };
      })
    );

    await transaction`
      UPDATE infrastructure_projects
      SET
        name = ${repository.name},
        repo_url = ${repository.repoUrl},
        github_owner = ${repository.owner},
        github_repo = ${repository.repo},
        latest_commit_hash = ${selectedHash},
        latest_commit_short_hash = ${shortHash(selectedHash)},
        latest_commit_subject = ${selectedSubject},
        latest_synced_at = now(),
        updated_at = now()
      WHERE id = ${projectId}
    `;

    await transaction`
      INSERT INTO infrastructure_project_branches (
        project_id,
        name,
        commit_hash,
        commit_short_hash,
        commit_subject,
        committed_at,
        protected,
        default_branch,
        last_synced_at
      )
      SELECT
        ${projectId},
        branch.name,
        branch.commit_hash,
        branch.commit_short_hash,
        branch.commit_subject,
        branch.committed_at,
        branch.protected,
        branch.default_branch,
        now()
      FROM jsonb_to_recordset(${branchSnapshot}::jsonb) AS branch(
        name TEXT,
        commit_hash TEXT,
        commit_short_hash TEXT,
        commit_subject TEXT,
        committed_at TIMESTAMPTZ,
        protected BOOLEAN,
        default_branch BOOLEAN
      )
      ON CONFLICT (project_id, name) DO UPDATE SET
        commit_hash = EXCLUDED.commit_hash,
        commit_short_hash = EXCLUDED.commit_short_hash,
        commit_subject = CASE
          WHEN EXCLUDED.commit_hash IS DISTINCT FROM infrastructure_project_branches.commit_hash
            THEN EXCLUDED.commit_subject
          ELSE COALESCE(EXCLUDED.commit_subject, infrastructure_project_branches.commit_subject)
        END,
        committed_at = CASE
          WHEN EXCLUDED.commit_hash IS DISTINCT FROM infrastructure_project_branches.commit_hash
            THEN EXCLUDED.committed_at
          ELSE COALESCE(EXCLUDED.committed_at, infrastructure_project_branches.committed_at)
        END,
        protected = EXCLUDED.protected,
        default_branch = EXCLUDED.default_branch,
        last_synced_at = EXCLUDED.last_synced_at
    `;

    await transaction`
      DELETE FROM infrastructure_project_branches AS persisted
      WHERE persisted.project_id = ${projectId}
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(${branchSnapshot}::jsonb) AS snapshot(name TEXT)
          WHERE snapshot.name = persisted.name
        )
    `;
  });

  const synced = await reloadProject(projectId);
  if (!synced) {
    throw new Error('Project was synced but could not be reloaded.');
  }

  return synced;
}
