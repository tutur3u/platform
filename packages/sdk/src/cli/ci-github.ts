import { execFileSync } from 'node:child_process';
import type { CiCache, Upstream } from './ci-cache';

// GitHub REST access for `ttr ci`. The token stays in memory: it is never
// written to the cache, the lock files, logs or error messages.

export const GITHUB_API = 'https://api.github.com';
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

export function resolveGithubToken(
  env: NodeJS.ProcessEnv = process.env,
  exec: () => string = () =>
    execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    })
) {
  const fromEnv = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    const token = exec().trim();
    if (token) return token;
  } catch {}
  throw new Error(
    'No GitHub token: set GH_TOKEN/GITHUB_TOKEN or run `gh auth login`.'
  );
}

export function githubUpstream(
  token: () => string,
  fetchImpl: typeof fetch = fetch
): Upstream {
  return async (url, { etag }) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'User-Agent': 'ttr-ci',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (etag) headers['If-None-Match'] = etag;
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const body =
      response.status === 200 ? await response.json() : await response.text();
    return { status: response.status, headers: response.headers, body };
  };
}

export function assertRepo(repo: string | undefined): string {
  if (
    !repo ||
    !REPO.test(repo) ||
    repo.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error(`Expected <owner/repo>, got ${repo ?? 'nothing'}`);
  return repo;
}

export function resolveSha(
  sha: string | undefined,
  revParse: (ref: string) => string = (ref) =>
    execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    })
): string {
  if (!sha) throw new Error('Expected a commit SHA');
  const lower = sha.toLowerCase();
  if (FULL_SHA.test(lower)) return lower;
  try {
    const resolved = revParse(sha).trim().toLowerCase();
    if (FULL_SHA.test(resolved)) return resolved;
  } catch {}
  throw new Error(
    `Cannot resolve ${sha} to a full commit SHA locally; pass all 40 hex characters`
  );
}

export interface WorkflowRun {
  id: number;
  name?: string | null;
  path?: string;
  event?: string;
  workflow_id?: number;
  head_sha?: string;
  status?: string | null;
  conclusion?: string | null;
  run_attempt?: number;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RunsPage {
  total_count?: number;
  workflow_runs?: WorkflowRun[];
}

export const RUNS_ACTIVE_TTL_MS = 20_000;
export const RUNS_DONE_TTL_MS = 120_000;
export const RATE_LIMIT_TTL_MS = 15_000;

export function runsTtl(body: unknown) {
  const runs = (body as RunsPage | undefined)?.workflow_runs ?? [];
  return runs.length > 0 && runs.every((run) => run.status === 'completed')
    ? RUNS_DONE_TTL_MS
    : RUNS_ACTIVE_TTL_MS;
}

export async function fetchRunsForSha(
  cache: CiCache,
  repo: string,
  sha: string
) {
  const url = `${GITHUB_API}/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`;
  const first = await cache.get<RunsPage>(`runs:${repo}:${sha}`, url, {
    ttl: runsTtl,
  });
  const total = first.body.total_count ?? first.body.workflow_runs?.length ?? 0;
  if (first.stale || total <= (first.body.workflow_runs?.length ?? 0))
    return first;

  const runs = [...(first.body.workflow_runs ?? [])];
  for (let page = 2; page <= 4 && runs.length < total; page++) {
    const next = await cache.get<RunsPage>(
      `runs:${repo}:${sha}:page:${page}`,
      `${url}&page=${page}`,
      { ttl: runsTtl }
    );
    const batch = next.body.workflow_runs ?? [];
    if (next.stale || next.body.total_count !== total)
      return { ...next, body: { total_count: total, workflow_runs: runs } };
    const seen = new Set(runs.map((run) => run.id));
    if (batch.some((run) => seen.has(run.id))) break;
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return { ...first, body: { total_count: total, workflow_runs: runs } };
}

export async function fetchRateLimit(cache: CiCache) {
  const result = await cache.get<{
    resources?: Record<
      string,
      { limit: number; remaining: number; reset: number; used: number }
    >;
  }>('rate_limit', `${GITHUB_API}/rate_limit`, {
    free: true,
    ttl: () => RATE_LIMIT_TTL_MS,
  });
  const core = result.body.resources?.core;
  if (core && !result.stale && result.source !== 'cache')
    await cache.recordLedger({
      remaining: core.remaining,
      limit: core.limit,
      resetAt: core.reset * 1000,
    });
  return result;
}
