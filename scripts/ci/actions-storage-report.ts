import { appendFileSync } from 'node:fs';

const GIB = 1024 ** 3;
const DEFAULT_API_VERSION = '2026-03-10';

type CacheUsage = {
  active_caches_count?: number;
  active_caches_size_in_bytes?: number;
};

type CacheLimit = {
  max_cache_size_gb?: number;
};

type CacheRetention = {
  max_cache_retention_days?: number;
};

type ActionsCache = {
  key?: string;
  size_in_bytes?: number;
};

type Artifact = {
  created_at?: string;
  expired?: boolean;
  name?: string;
  size_in_bytes?: number;
};

type Repository = {
  private?: boolean;
  visibility?: string;
};

type StorageEntry = {
  name: string;
  size: number;
};

export type UsageLevel = 'normal' | 'notice' | 'warning' | 'critical';

type Thresholds = {
  critical: number;
  notice: number;
  warning: number;
};

type GroupSummary = {
  bytes: number;
  count: number;
  family: string;
};

type CollectionProperty = 'actions_caches' | 'artifacts';

class GitHubApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function classifyUsage(
  percentage: number,
  thresholds: Thresholds
): UsageLevel {
  if (percentage >= thresholds.critical) return 'critical';
  if (percentage >= thresholds.warning) return 'warning';
  if (percentage >= thresholds.notice) return 'notice';
  return 'normal';
}

export function storageFamily(name: string): string {
  const normalized = name.trim().toLowerCase();

  for (const family of [
    'e2e-failure',
    'migration-e2e',
    'e2e-diagnostics',
    'playwright-report',
    'test-results',
    'supabase-docker',
    'docker-backend',
    'docker-web',
    'docker-tanstack',
    'codeql-overlay-db',
    'codeql-trap',
    'discord-pytest-results',
    'cloudflare-smoke',
    'android-production-aab',
    'ios-production-ipa',
    'android-dev-apk',
    'ios-dev-app',
    'macos-dev-app',
    'windows-dev-app',
  ]) {
    if (normalized === family || normalized.startsWith(`${family}-`)) {
      return family;
    }
  }

  if (normalized.includes('-turbo-') || normalized.startsWith('turbo-')) {
    return 'turbo';
  }

  if (normalized.startsWith('bun-')) return 'bun';
  if (normalized.startsWith('rust-')) return 'rust';

  return normalized.split('-').filter(Boolean).slice(0, 3).join('-') || 'other';
}

export function groupStorage(entries: StorageEntry[]): GroupSummary[] {
  const groups = new Map<string, GroupSummary>();

  for (const entry of entries) {
    const family = storageFamily(entry.name);
    const group = groups.get(family) ?? { bytes: 0, count: 0, family };
    group.bytes += Math.max(0, entry.size);
    group.count += 1;
    groups.set(family, group);
  }

  return [...groups.values()].sort(
    (left, right) =>
      right.bytes - left.bytes || left.family.localeCompare(right.family)
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** unit;
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export async function paginateGitHubCollection<T>({
  maxPages = 500,
  path,
  property,
  request,
}: {
  maxPages?: number;
  path: string;
  property: CollectionProperty;
  request: (
    path: string,
    query: Record<string, number>
  ) => Promise<Record<string, T[]>>;
}): Promise<T[]> {
  const values: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await request(path, { page, per_page: 100 });
    const pageValues = response[property] ?? [];
    values.push(...pageValues);

    if (pageValues.length < 100) return values;
  }

  throw new Error(
    `GitHub API pagination exceeded ${maxPages} pages for ${path}.`
  );
}

function createApiClient({
  apiBase,
  apiVersion,
  token,
}: {
  apiBase: string;
  apiVersion: string;
  token: string;
}) {
  async function request<T>(
    path: string,
    query?: Record<string, string | number>
  ) {
    const url = new URL(path, `${apiBase.replace(/\/$/, '')}/`);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': apiVersion,
      },
    });

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API GET ${url.pathname} failed with ${response.status}.`,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  async function paginate<T>(
    path: string,
    property: CollectionProperty
  ): Promise<T[]> {
    return paginateGitHubCollection<T>({
      path,
      property,
      request: (pagePath, query) =>
        request<Record<string, T[]>>(pagePath, query),
    });
  }

  return { paginate, request };
}

function table(groups: GroupSummary[]): string {
  if (groups.length === 0) return '_None._';

  return [
    '| Family | Entries | Bytes |',
    '| --- | ---: | ---: |',
    ...groups
      .slice(0, 15)
      .map(
        (group) =>
          `| ${group.family} | ${group.count} | ${formatBytes(group.bytes)} |`
      ),
  ].join('\n');
}

function emitUsageAnnotation(level: UsageLevel, percentage: number) {
  const detail = `Actions caches use ${percentage.toFixed(1)}% of the configured limit.`;

  if (level === 'critical') {
    console.log(`::error title=Actions cache storage critical::${detail}`);
  } else if (level === 'warning') {
    console.log(`::warning title=Actions cache storage warning::${detail}`);
  } else if (level === 'notice') {
    console.log(`::notice title=Actions cache storage notice::${detail}`);
  }
}

function optionalValue<T>(
  promise: Promise<T>,
  label: string
): Promise<T | null> {
  return promise.catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`::notice title=${label} unavailable::${detail}`);
    return null;
  });
}

async function main(env = process.env) {
  const repository = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;

  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
  if (!token) throw new Error('GITHUB_TOKEN is required.');

  const [owner, repo] = repository.split('/');
  if (!owner || !repo)
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);

  const thresholds = {
    critical: parsePositiveNumber(env.CACHE_CRITICAL_PERCENT, 100),
    notice: parsePositiveNumber(env.CACHE_NOTICE_PERCENT, 80),
    warning: parsePositiveNumber(env.CACHE_WARNING_PERCENT, 90),
  };

  if (
    !(
      thresholds.notice < thresholds.warning &&
      thresholds.warning < thresholds.critical
    )
  ) {
    throw new Error(
      'Cache thresholds must increase from notice to warning to critical.'
    );
  }

  const api = createApiClient({
    apiBase: env.GITHUB_API_URL ?? 'https://api.github.com',
    apiVersion: env.GITHUB_API_VERSION ?? DEFAULT_API_VERSION,
    token,
  });
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const [metadata, usage, limit, retention, caches, artifacts] =
    await Promise.all([
      api.request<Repository>(repositoryPath),
      api.request<CacheUsage>(`${repositoryPath}/actions/cache/usage`),
      optionalValue(
        api.request<CacheLimit>(
          `${repositoryPath}/actions/cache/storage-limit`
        ),
        'Cache storage limit'
      ),
      optionalValue(
        api.request<CacheRetention>(
          `${repositoryPath}/actions/cache/retention-limit`
        ),
        'Cache retention limit'
      ),
      api.paginate<ActionsCache>(
        `${repositoryPath}/actions/caches`,
        'actions_caches'
      ),
      api.paginate<Artifact>(
        `${repositoryPath}/actions/artifacts`,
        'artifacts'
      ),
    ]);

  const cacheBytes = usage.active_caches_size_in_bytes ?? 0;
  const limitBytes = (limit?.max_cache_size_gb ?? 0) * GIB;
  const percentage = limitBytes > 0 ? (cacheBytes / limitBytes) * 100 : null;
  const level =
    percentage == null ? null : classifyUsage(percentage, thresholds);
  if (percentage != null && level) emitUsageAnnotation(level, percentage);

  const activeArtifacts = artifacts.filter(
    (artifact) => artifact.expired !== true
  );
  const artifactBytes = activeArtifacts.reduce(
    (total, artifact) => total + (artifact.size_in_bytes ?? 0),
    0
  );
  const oldestArtifactMs = activeArtifacts.reduce((oldest, artifact) => {
    const createdAt = Date.parse(artifact.created_at ?? '');
    return Number.isFinite(createdAt) ? Math.min(oldest, createdAt) : oldest;
  }, Date.now());
  const oldestArtifactDays = Math.max(
    0,
    Math.floor((Date.now() - oldestArtifactMs) / 86_400_000)
  );
  const cacheGroups = groupStorage(
    caches.map((cache) => ({
      name: cache.key ?? 'other',
      size: cache.size_in_bytes ?? 0,
    }))
  );
  const artifactGroups = groupStorage(
    activeArtifacts.map((artifact) => ({
      name: artifact.name ?? 'other',
      size: artifact.size_in_bytes ?? 0,
    }))
  );

  const report = [
    '# GitHub Actions storage report',
    '',
    `- Repository visibility: ${metadata.visibility ?? (metadata.private ? 'private' : 'public')}`,
    `- Active caches: ${usage.active_caches_count ?? caches.length} (${formatBytes(cacheBytes)})`,
    `- Configured cache limit: ${limitBytes > 0 ? formatBytes(limitBytes) : 'unavailable'}`,
    `- Cache utilization: ${percentage == null ? 'unavailable' : `${percentage.toFixed(1)}% (${level})`}`,
    `- Configured cache retention: ${retention?.max_cache_retention_days ?? 'unavailable'} days`,
    `- Active artifacts: ${activeArtifacts.length} (${formatBytes(artifactBytes)})`,
    `- Oldest active artifact: ${oldestArtifactDays} days`,
    '',
    '## Cache families',
    '',
    table(cacheGroups),
    '',
    '## Artifact families',
    '',
    table(artifactGroups),
    '',
    'Artifacts have no fixed byte cap in this report. Public-repository billing discounts and plan allowances may change; retention is based on operational usefulness rather than an assumed unlimited entitlement.',
    '',
  ].join('\n');

  console.log(report);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, report);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
