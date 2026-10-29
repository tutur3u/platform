export interface ParsedGitHubRepository {
  owner: string;
  repo: string;
  repoUrl: string;
}

export interface GitHubRepositoryResponse {
  default_branch?: string;
  full_name?: string;
  html_url?: string;
  name?: string;
  owner?: {
    login?: string;
  };
  private?: boolean;
}

export interface GitHubBranchResponse {
  commit?: {
    sha?: string;
  };
  name?: string;
  protected?: boolean;
}

export interface GitHubCommitResponse {
  commit?: {
    author?: {
      date?: string;
    };
    message?: string;
  };
  sha?: string;
}

export interface ProjectRow {
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

export interface BranchRow {
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

export interface QueuedPlatformProjectRow {
  deployment_status: string;
  id: string;
  latest_commit_hash: string | null;
  updated_at: Date | string | null;
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

export function normalizeAppRoot(value: string | null | undefined) {
  return (value ?? '').trim().replace(/^\/+|\/+$/g, '');
}

const RESERVED_MANAGED_PROJECT_HOSTNAMES = new Set([
  'api.tuturuuu.com',
  'apps.tuturuuu.com',
  'calendar.tuturuuu.com',
  'cms.tuturuuu.com',
  'dev.staging.tutur3u.com',
  'finance.tuturuuu.com',
  'hive.tuturuuu.com',
  'inventory.tuturuuu.com',
  'learn.tuturuuu.com',
  'localhost',
  'mail.tuturuuu.com',
  'mira.tuturuuu.com',
  'nova.ai.vn',
  'platform.tuturuuu.com',
  'qr.tuturuuu.com',
  'rewise.me',
  'staging.tuturuuu.com',
  'tasks.tuturuuu.com',
  'teach.tuturuuu.com',
  'tools.tuturuuu.com',
  'track.tuturuuu.com',
  'tuturuuu.com',
  'www.tuturuuu.com',
]);
const SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export function normalizeInfrastructureProjectHostnames(
  hostnames: string[] | null | undefined
) {
  const normalizedHostnames = [
    ...new Set(
      (hostnames ?? [])
        .map(normalizeHostname)
        .filter((hostname) => hostname.length > 0)
    ),
  ];

  if (
    normalizedHostnames.some(
      (hostname) => !SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(hostname)
    )
  ) {
    throw new Error(
      'Enter managed project hostnames as DNS names without ports, wildcards, whitespace, or nginx syntax.'
    );
  }

  if (
    normalizedHostnames.some((hostname) =>
      RESERVED_MANAGED_PROJECT_HOSTNAMES.has(hostname)
    )
  ) {
    throw new Error(
      'Managed project hostnames cannot use reserved Tuturuuu platform hostnames.'
    );
  }

  return normalizedHostnames;
}
