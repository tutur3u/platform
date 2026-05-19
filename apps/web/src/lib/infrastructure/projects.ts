import crypto from 'node:crypto';
import type {
  BlueGreenMonitoringDeployment,
  InfrastructureProject,
} from '@tuturuuu/internal-api/infrastructure';
import { readBlueGreenMonitoringSnapshot } from './blue-green-monitoring';
import {
  ensureLogDrainSchema,
  getLogDrainSqlClient,
  serverLogger,
} from './log-drain';

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

interface GitHubBranchResponse {
  commit?: {
    sha?: string;
  };
  name?: string;
  protected?: boolean;
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

interface ProjectRow {
  app_root: string;
  auto_deploy_enabled: boolean;
  created_at: Date;
  cron_enabled: boolean;
  deployment_status: string;
  environment: string;
  github_owner: string;
  github_repo: string;
  hostnames: string[] | null;
  id: string;
  is_builtin: boolean;
  last_deployed_at: Date | null;
  latest_commit_hash: string | null;
  latest_commit_short_hash: string | null;
  latest_commit_subject: string | null;
  latest_synced_at: Date | null;
  log_drain_enabled: boolean;
  metadata: Record<string, unknown> | null;
  name: string;
  nginx_enabled: boolean;
  port: number;
  preset: string;
  redis_enabled: boolean;
  repo_url: string;
  selected_branch: string;
  updated_at: Date;
}

interface BranchRow {
  commit_hash: string | null;
  commit_short_hash: string | null;
  commit_subject: string | null;
  committed_at: Date | null;
  default_branch: boolean;
  last_synced_at: Date;
  name: string;
  project_id: string;
  protected: boolean;
}

interface QueuedPlatformProjectRow {
  deployment_status: string;
  id: string;
  latest_commit_hash: string | null;
  updated_at: Date | string | null;
}

export interface CreateInfrastructureProjectInput {
  appRoot?: string | null;
  hostnames?: string[] | null;
  repoUrl: string;
  selectedBranch?: string | null;
}

export interface UpdateInfrastructureProjectInput {
  appRoot?: string;
  autoDeployEnabled?: boolean;
  cronEnabled?: boolean;
  hostnames?: string[];
  logDrainEnabled?: boolean;
  name?: string;
  redisEnabled?: boolean;
  selectedBranch?: string;
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

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

function normalizeHostnames(hostnames: string[] | null | undefined) {
  return [
    ...new Set(
      (hostnames ?? [])
        .map(normalizeHostname)
        .filter((hostname) => hostname.length > 0)
    ),
  ];
}

function normalizeAppRoot(value: string | null | undefined) {
  return (value ?? '').trim().replace(/^\/+|\/+$/g, '');
}

function normalizeBranch(value: string | null | undefined, fallback: string) {
  return (value ?? '').trim() || fallback;
}

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function toProject(
  row: ProjectRow,
  branches: BranchRow[]
): InfrastructureProject {
  return {
    addons: {
      cron: row.cron_enabled,
      logDrain: row.log_drain_enabled,
      nginx: true,
      redis: row.redis_enabled,
    },
    appRoot: row.app_root,
    autoDeployEnabled: row.auto_deploy_enabled,
    branches: branches.map((branch) => ({
      commitHash: branch.commit_hash,
      commitShortHash: branch.commit_short_hash,
      commitSubject: branch.commit_subject,
      committedAt: toTimestamp(branch.committed_at),
      defaultBranch: branch.default_branch,
      lastSyncedAt: toTimestamp(branch.last_synced_at) ?? Date.now(),
      name: branch.name,
      protected: branch.protected,
    })),
    createdAt: toTimestamp(row.created_at) ?? Date.now(),
    deploymentStatus: row.deployment_status,
    environment: row.environment,
    hostnames: row.hostnames ?? [],
    id: row.id,
    isBuiltin: row.is_builtin,
    lastDeployedAt: toTimestamp(row.last_deployed_at),
    latestCommitHash: row.latest_commit_hash,
    latestCommitShortHash: row.latest_commit_short_hash,
    latestCommitSubject: row.latest_commit_subject,
    latestSyncedAt: toTimestamp(row.latest_synced_at),
    name: row.name,
    port: row.port,
    preset: row.preset,
    repo: {
      owner: row.github_owner,
      repo: row.github_repo,
      url: row.repo_url,
    },
    selectedBranch: row.selected_branch,
    updatedAt: toTimestamp(row.updated_at) ?? Date.now(),
  };
}

async function getSql() {
  await ensureLogDrainSchema();
  const sql = getLogDrainSqlClient();
  if (!sql) {
    throw new Error('The infrastructure log drain database is not configured.');
  }

  return sql;
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

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: getGitHubHeaders(),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${url}.`);
  }

  return response.json() as Promise<T>;
}

async function fetchGitHubRepository(repo: ParsedGitHubRepository) {
  const repository = await fetchGitHubJson<GitHubRepositoryResponse>(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}`
  );

  if (repository.private) {
    throw new Error('Private GitHub repositories are not supported in v1.');
  }

  const owner = repository.owner?.login ?? repo.owner;
  const repoName = repository.name ?? repo.repo;

  return {
    defaultBranch: repository.default_branch || 'main',
    name: repository.full_name ?? `${owner}/${repoName}`,
    owner,
    repo: repoName,
    repoUrl: repository.html_url ?? repo.repoUrl,
  };
}

async function fetchGitHubBranches(repo: ParsedGitHubRepository) {
  return fetchGitHubJson<GitHubBranchResponse[]>(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/branches?per_page=100`
  );
}

async function fetchGitHubCommit(
  repo: ParsedGitHubRepository,
  ref: string
): Promise<GitHubCommitResponse | null> {
  try {
    return await fetchGitHubJson<GitHubCommitResponse>(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(ref)}`
    );
  } catch (error) {
    serverLogger.warn('Unable to sync GitHub commit metadata', {
      error: error instanceof Error ? error.message : String(error),
      ref,
      repo: repo.repoUrl,
    });
    return null;
  }
}

function firstLine(value: string | null | undefined) {
  return value?.split('\n')[0]?.trim() || null;
}

function shortHash(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function getDeploymentTime(deployment: BlueGreenMonitoringDeployment) {
  return (
    deployment.finishedAt ??
    deployment.activatedAt ??
    deployment.startedAt ??
    null
  );
}

function getServedPlatformDeployment(
  deployments: BlueGreenMonitoringDeployment[]
) {
  const successfulDeployments = deployments.filter(
    (deployment) => deployment.status === 'successful' && deployment.commitHash
  );
  const activeDeployment = successfulDeployments.find(
    (deployment) => deployment.runtimeState === 'active'
  );

  return (
    activeDeployment ??
    successfulDeployments.sort(
      (left, right) =>
        (getDeploymentTime(right) ?? 0) - (getDeploymentTime(left) ?? 0)
    )[0] ??
    null
  );
}

export function getQueuedPlatformProjectReconciliation(
  row: QueuedPlatformProjectRow,
  deployments: BlueGreenMonitoringDeployment[]
) {
  if (row.id !== 'platform' || row.deployment_status !== 'queued') {
    return null;
  }

  const deployment = getServedPlatformDeployment(deployments);
  if (!deployment?.commitHash) {
    return null;
  }

  const deployedAt = getDeploymentTime(deployment);
  const queuedAt = toTimestamp(row.updated_at);
  const deployedAfterQueue =
    deployedAt != null && queuedAt != null && deployedAt >= queuedAt;
  const commitMatchesQueuedHead =
    row.latest_commit_hash != null &&
    deployment.commitHash === row.latest_commit_hash;

  if (!(commitMatchesQueuedHead || deployedAfterQueue)) {
    return null;
  }

  return {
    deployedAt,
    deploymentStamp: deployment.deploymentStamp ?? null,
    latestCommitHash: deployment.commitHash,
    latestCommitShortHash:
      deployment.commitShortHash ?? shortHash(deployment.commitHash),
    latestCommitSubject: deployment.commitSubject ?? null,
  };
}

function makeProjectId(owner: string, repo: string, repoUrl: string) {
  const slug = `${owner}-${repo}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (slug && slug !== 'platform') {
    return slug;
  }

  const suffix = crypto
    .createHash('sha1')
    .update(repoUrl)
    .digest('hex')
    .slice(0, 8);
  return `${slug || 'project'}-${suffix}`;
}

export async function listInfrastructureProjects() {
  const sql = await getSql();
  const rows = await sql<ProjectRow[]>`
    SELECT *
    FROM infrastructure_projects
    ORDER BY is_builtin DESC, updated_at DESC, id ASC
  `;
  const reconciledRows = await reconcileQueuedPlatformProjectRows(sql, rows);
  const branches = await sql<BranchRow[]>`
    SELECT *
    FROM infrastructure_project_branches
    ORDER BY default_branch DESC, name ASC
  `;
  const branchesByProject = new Map<string, BranchRow[]>();
  for (const branch of branches) {
    branchesByProject.set(branch.project_id, [
      ...(branchesByProject.get(branch.project_id) ?? []),
      branch,
    ]);
  }

  return reconciledRows.map((row) =>
    toProject(row, branchesByProject.get(row.id) ?? [])
  );
}

async function reconcileQueuedPlatformProjectRows(
  sql: Awaited<ReturnType<typeof getSql>>,
  rows: ProjectRow[]
) {
  const platformRow = rows.find(
    (row) => row.id === 'platform' && row.deployment_status === 'queued'
  );
  if (!platformRow) {
    return rows;
  }

  let reconciliation: ReturnType<
    typeof getQueuedPlatformProjectReconciliation
  > = null;

  try {
    const snapshot = readBlueGreenMonitoringSnapshot({
      requestPreviewLimit: 0,
      watcherLogLimit: 0,
    });
    reconciliation = getQueuedPlatformProjectReconciliation(
      platformRow,
      snapshot.deployments
    );
  } catch (error) {
    serverLogger.warn('Unable to reconcile queued platform project status', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!reconciliation) {
    return rows;
  }

  await sql`
    UPDATE infrastructure_projects
    SET
      deployment_status = 'ready',
      latest_commit_hash = ${reconciliation.latestCommitHash},
      latest_commit_short_hash = ${reconciliation.latestCommitShortHash},
      latest_commit_subject = ${reconciliation.latestCommitSubject},
      latest_synced_at = now(),
      last_deployed_at = COALESCE(${reconciliation.deployedAt ? new Date(reconciliation.deployedAt) : null}, last_deployed_at, now()),
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
        deployedAt: reconciliation.deployedAt
          ? new Date(reconciliation.deployedAt).toISOString()
          : null,
        deployedCommitHash: reconciliation.latestCommitHash,
        deploymentStamp: reconciliation.deploymentStamp,
        reconciledQueuedStatusAt: new Date().toISOString(),
      })}::jsonb,
      updated_at = now()
    WHERE id = 'platform'
      AND deployment_status = 'queued'
  `;

  return rows.map((row) =>
    row.id === 'platform'
      ? {
          ...row,
          deployment_status: 'ready',
          last_deployed_at: reconciliation.deployedAt
            ? new Date(reconciliation.deployedAt)
            : row.last_deployed_at,
          latest_commit_hash: reconciliation.latestCommitHash,
          latest_commit_short_hash: reconciliation.latestCommitShortHash,
          latest_commit_subject: reconciliation.latestCommitSubject,
          latest_synced_at: new Date(),
          updated_at: new Date(),
        }
      : row
  );
}

export async function getInfrastructureProject(projectId: string) {
  const projects = await listInfrastructureProjects();
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function createInfrastructureProject(
  input: CreateInfrastructureProjectInput
) {
  const parsed = parsePublicGitHubRepoUrl(input.repoUrl);
  const repository = await fetchGitHubRepository(parsed);
  const selectedBranch = normalizeBranch(
    input.selectedBranch,
    repository.defaultBranch
  );
  const projectId = makeProjectId(
    repository.owner,
    repository.repo,
    parsed.repoUrl
  );
  const sql = await getSql();

  const existing = await sql<ProjectRow[]>`
    SELECT *
    FROM infrastructure_projects
    WHERE id = ${projectId}
       OR (github_owner = ${repository.owner} AND github_repo = ${repository.repo})
    LIMIT 1
  `;

  if (existing.length > 0) {
    throw new Error('This GitHub repository is already registered.');
  }

  await sql`
    INSERT INTO infrastructure_projects (
      id,
      name,
      repo_url,
      github_owner,
      github_repo,
      selected_branch,
      app_root,
      environment,
      preset,
      port,
      hostnames,
      auto_deploy_enabled,
      nginx_enabled,
      log_drain_enabled,
      redis_enabled,
      cron_enabled,
      is_builtin,
      deployment_status
    )
    VALUES (
      ${projectId},
      ${repository.name},
      ${repository.repoUrl},
      ${repository.owner},
      ${repository.repo},
      ${selectedBranch},
      ${normalizeAppRoot(input.appRoot)},
      'production',
      'nextjs',
      3000,
      ${normalizeHostnames(input.hostnames)},
      true,
      true,
      true,
      true,
      false,
      false,
      'synced'
    )
  `;

  await syncInfrastructureProject(projectId);
  const created = await getInfrastructureProject(projectId);
  if (!created) {
    throw new Error('Project was created but could not be reloaded.');
  }

  return created;
}

export async function updateInfrastructureProject(
  projectId: string,
  input: UpdateInfrastructureProjectInput
) {
  const sql = await getSql();
  const project = await getInfrastructureProject(projectId);
  if (!project) {
    throw new Error('Project not found.');
  }

  const selectedBranch =
    input.selectedBranch == null
      ? project.selectedBranch
      : normalizeBranch(input.selectedBranch, project.selectedBranch);

  await sql`
    UPDATE infrastructure_projects
    SET
      name = ${input.name?.trim() || project.name},
      selected_branch = ${selectedBranch},
      app_root = ${input.appRoot == null ? project.appRoot : normalizeAppRoot(input.appRoot)},
      hostnames = ${input.hostnames == null ? project.hostnames : normalizeHostnames(input.hostnames)},
      auto_deploy_enabled = ${input.autoDeployEnabled ?? project.autoDeployEnabled},
      nginx_enabled = true,
      log_drain_enabled = ${input.logDrainEnabled ?? project.addons.logDrain},
      redis_enabled = ${input.redisEnabled ?? project.addons.redis},
      cron_enabled = ${input.cronEnabled ?? project.addons.cron},
      updated_at = now()
    WHERE id = ${projectId}
  `;

  if (selectedBranch !== project.selectedBranch) {
    await queueInfrastructureProjectDeployment(projectId);
  }

  const updated = await getInfrastructureProject(projectId);
  if (!updated) {
    throw new Error('Project was updated but could not be reloaded.');
  }

  return updated;
}

export async function deleteInfrastructureProject(projectId: string) {
  const sql = await getSql();
  const project = await getInfrastructureProject(projectId);
  if (!project) {
    throw new Error('Project not found.');
  }
  if (project.isBuiltin) {
    throw new Error('The built-in platform project cannot be removed.');
  }

  await sql`
    DELETE FROM infrastructure_projects
    WHERE id = ${projectId}
      AND is_builtin IS NOT TRUE
  `;

  return project;
}

export async function syncInfrastructureProject(projectId: string) {
  const sql = await getSql();
  const rows = await sql<ProjectRow[]>`
    SELECT *
    FROM infrastructure_projects
    WHERE id = ${projectId}
    LIMIT 1
  `;
  const project = rows[0];
  if (!project) {
    throw new Error('Project not found.');
  }

  const parsed = parsePublicGitHubRepoUrl(project.repo_url);
  const [repository, branches] = await Promise.all([
    fetchGitHubRepository(parsed),
    fetchGitHubBranches(parsed),
  ]);
  const selectedBranch = normalizeBranch(
    project.selected_branch,
    repository.defaultBranch
  );
  const selectedCommit = await fetchGitHubCommit(parsed, selectedBranch);
  const selectedHash =
    selectedCommit?.sha ??
    branches.find((branch) => branch.name === selectedBranch)?.commit?.sha ??
    null;
  const selectedSubject = firstLine(selectedCommit?.commit?.message);

  await sql.begin(async (transaction) => {
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

    for (const branch of branches) {
      if (!branch.name) {
        continue;
      }

      const commit = branch.name === selectedBranch ? selectedCommit : null;
      const commitHash = branch.commit?.sha ?? commit?.sha ?? null;
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
        VALUES (
          ${projectId},
          ${branch.name},
          ${commitHash},
          ${shortHash(commitHash)},
          ${firstLine(commit?.commit?.message)},
          ${commit?.commit?.author?.date ? new Date(commit.commit.author.date) : null},
          ${branch.protected ?? false},
          ${branch.name === repository.defaultBranch},
          now()
        )
        ON CONFLICT (project_id, name) DO UPDATE SET
          commit_hash = EXCLUDED.commit_hash,
          commit_short_hash = EXCLUDED.commit_short_hash,
          commit_subject = COALESCE(EXCLUDED.commit_subject, infrastructure_project_branches.commit_subject),
          committed_at = COALESCE(EXCLUDED.committed_at, infrastructure_project_branches.committed_at),
          protected = EXCLUDED.protected,
          default_branch = EXCLUDED.default_branch,
          last_synced_at = EXCLUDED.last_synced_at
      `;
    }
  });

  const synced = await getInfrastructureProject(projectId);
  if (!synced) {
    throw new Error('Project was synced but could not be reloaded.');
  }

  return synced;
}

export async function queueInfrastructureProjectDeployment(projectId: string) {
  const sql = await getSql();
  const project = await getInfrastructureProject(projectId);
  if (!project) {
    throw new Error('Project not found.');
  }

  await sql`
    UPDATE infrastructure_projects
    SET
      deployment_status = 'queued',
      metadata = jsonb_set(
        metadata,
        '{queuedAt}',
        to_jsonb(now()),
        true
      ),
      updated_at = now()
    WHERE id = ${projectId}
  `;

  const queued = await getInfrastructureProject(projectId);
  if (!queued) {
    throw new Error('Project was queued but could not be reloaded.');
  }

  return queued;
}
