import {
  BudgetExhausted,
  type CollectWindow,
  type Collected,
  MAX_MARKER_ROWS,
  MAX_ROLLUP_ROWS,
  type MarkerRow,
  ProviderError,
  type ProviderCall,
  type RollupRow,
  type SourceCollector,
} from './collector';
import { fetchProviderJson, type ProviderFetchDeps } from './provider-fetch';

// GitHub Actions collector: run counts, failures, duration and queue time per
// workflow in 15-minute buckets, and successful production deploy runs on
// main as deploy markers. Read-only fine-grained token (Actions read) for one
// repository. Each bucket is read whole before the watermark passes it; a
// bucket larger than one run's request budget (or the listing's 1,000-result
// cap) is stored as a sample, with `runs` from total_count and
// `sampled_runs` from what was read, so progress never stalls.

export const GITHUB_REPOSITORY = 'tutur3u/platform';
export const HOUR_MS = 60 * 60_000;
// Most runs finish within two hours of creation; later buckets wait.
export const GITHUB_SETTLE_MS = 2 * HOUR_MS;
export const GITHUB_FIRST_RUN_LOOKBACK_MS = 6 * HOUR_MS;
export const GITHUB_MAX_LOOKBACK_MS = 7 * 24 * HOUR_MS;
export const GITHUB_BUCKET_MS = 15 * 60_000;
export const GITHUB_MAX_BUCKETS_PER_RUN = 12;
export const GITHUB_PAGE_SIZE = 100;
// The runs listing returns at most 1,000 results per filter.
export const GITHUB_MAX_PAGES = 10;

const SLUG = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const DEPLOY_WORKFLOWS: readonly [
  RegExp,
  (match: RegExpMatchArray) => string,
][] = [
  [/^\.github\/workflows\/([a-z0-9-]+)-cloudflare\.ya?ml$/, (m) => m[1]!],
  [
    /^\.github\/workflows\/vercel-production-([a-z0-9-]+)\.ya?ml$/,
    (m) => (m[1] === 'platform' ? 'web' : m[1]!),
  ],
  [/^\.github\/workflows\/supabase-production\.ya?ml$/, () => 'supabase'],
];
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const DEPLOY_EVENTS = new Set(['push', 'workflow_dispatch', 'workflow_run']);

export function planGithubWindow(
  now: number,
  watermark: number | null
): CollectWindow | null {
  const closed =
    Math.floor((now - GITHUB_SETTLE_MS) / GITHUB_BUCKET_MS) * GITHUB_BUCKET_MS;
  const floor = closed - GITHUB_MAX_LOOKBACK_MS;
  const start = Math.max(
    floor,
    watermark ?? closed - GITHUB_FIRST_RUN_LOOKBACK_MS
  );
  const since = Math.floor(start / GITHUB_BUCKET_MS) * GITHUB_BUCKET_MS;
  const until = Math.min(
    closed,
    since + GITHUB_MAX_BUCKETS_PER_RUN * GITHUB_BUCKET_MS
  );
  return since < until ? { since, until } : null;
}

interface Run {
  conclusion?: unknown;
  created_at?: unknown;
  event?: unknown;
  head_branch?: unknown;
  head_sha?: unknown;
  id?: unknown;
  path?: unknown;
  run_started_at?: unknown;
  status?: unknown;
  updated_at?: unknown;
}

export function workflowSlug(path: unknown) {
  if (typeof path !== 'string') return null;
  const match = /^\.github\/workflows\/([^/]+)\.ya?ml$/.exec(path);
  const slug = match?.[1]?.toLowerCase() ?? '';
  return SLUG.test(slug) ? slug : null;
}

function time(value: unknown) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Nearest-rank percentile of non-negative seconds, or null when empty. */
export function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1]!;
}

export function deployMarker(run: Run): MarkerRow | null {
  if (
    run.conclusion !== 'success' ||
    run.head_branch !== 'main' ||
    !DEPLOY_EVENTS.has(String(run.event)) ||
    typeof run.path !== 'string' ||
    typeof run.id !== 'number' ||
    !Number.isSafeInteger(run.id)
  )
    return null;
  const completed = time(run.updated_at);
  if (completed === null) return null;
  for (const [pattern, service] of DEPLOY_WORKFLOWS) {
    const match = run.path.match(pattern);
    if (!match) continue;
    const name = service(match);
    if (!SLUG.test(name)) return null;
    return {
      deployed_at: new Date(completed).toISOString(),
      kind: 'deploy',
      service: name,
      sha:
        typeof run.head_sha === 'string' && /^[0-9a-f]{40}$/.test(run.head_sha)
          ? run.head_sha
          : null,
      version_id: `gha-${run.id}`,
    };
  }
  return null;
}

interface Stats {
  durations: number[];
  failed: number;
  queues: number[];
  runs: number;
}

export function bucketRollups(
  runs: Run[],
  bucketStart: number,
  totalCount: number
): RollupRow[] {
  const byWorkflow = new Map<string, Stats>();
  const all: Stats = { durations: [], failed: 0, queues: [], runs: 0 };
  for (const run of runs) {
    const slug = workflowSlug(run.path);
    if (!slug) continue;
    const stats = byWorkflow.get(slug) ?? {
      durations: [],
      failed: 0,
      queues: [],
      runs: 0,
    };
    byWorkflow.set(slug, stats);
    for (const target of [stats, all]) {
      target.runs++;
      if (FAILED.has(String(run.conclusion))) target.failed++;
      const created = time(run.created_at);
      const started = time(run.run_started_at);
      const updated = time(run.updated_at);
      if (created !== null && started !== null && started >= created)
        target.queues.push((started - created) / 1000);
      if (
        run.status === 'completed' &&
        started !== null &&
        updated !== null &&
        updated >= started
      )
        target.durations.push((updated - started) / 1000);
    }
  }
  const start = new Date(bucketStart).toISOString();
  const rows: RollupRow[] = [];
  const add = (service: string, metric: string, value: number | null) => {
    if (value === null) return;
    rows.push({
      bucket_seconds: 900,
      bucket_start: start,
      metric,
      service,
      value: Math.round(value * 10) / 10,
    });
  };
  const emit = (service: string, stats: Stats, runsValue: number) => {
    add(service, 'runs', runsValue);
    add(service, 'failed_runs', stats.failed);
    add(service, 'duration_p50_s', percentile(stats.durations, 50));
    add(service, 'duration_p95_s', percentile(stats.durations, 95));
    add(service, 'queue_p50_s', percentile(stats.queues, 50));
    add(service, 'queue_p95_s', percentile(stats.queues, 95));
  };
  for (const [slug, stats] of byWorkflow) emit(slug, stats, stats.runs);
  emit('all', all, Math.max(totalCount, all.runs));
  add('all', 'sampled_runs', all.runs);
  return rows;
}

export interface GithubCollectorDeps extends ProviderFetchDeps {
  token: string;
}

export function githubCollector(deps: GithubCollectorDeps): SourceCollector {
  async function page(window: CollectWindow, number: number) {
    const url = new URL(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs`
    );
    url.searchParams.set(
      'created',
      `${new Date(window.since).toISOString()}..${new Date(window.until - 1000).toISOString()}`
    );
    url.searchParams.set('per_page', String(GITHUB_PAGE_SIZE));
    url.searchParams.set('page', String(number));
    url.searchParams.set('exclude_pull_requests', 'true');
    const { json } = await fetchProviderJson(deps, url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${deps.token}`,
        'User-Agent': 'Tuturuuu-Cron-Control/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    const record = json as { total_count?: unknown; workflow_runs?: unknown };
    if (
      typeof record?.total_count !== 'number' ||
      !Array.isArray(record.workflow_runs)
    )
      throw new ProviderError('invalid');
    return {
      runs: record.workflow_runs as Run[],
      total: record.total_count,
    };
  }

  /**
   * Reads one bucket's pages. A spent budget ends the read early and is
   * reported, never thrown, so the caller decides whether to keep a sample.
   */
  async function bucket(call: ProviderCall, start: number) {
    const window = { since: start, until: start + GITHUB_BUCKET_MS };
    const runs: Run[] = [];
    let total = 0;
    let exhausted = false;
    for (let number = 1; number <= GITHUB_MAX_PAGES; number++) {
      let result: { runs: Run[]; total: number };
      try {
        result = await call(() => page(window, number));
      } catch (error) {
        if (!(error instanceof BudgetExhausted)) throw error;
        exhausted = true;
        break;
      }
      total = result.total;
      runs.push(...result.runs);
      if (result.runs.length < GITHUB_PAGE_SIZE || runs.length >= total) break;
    }
    return { exhausted, runs, total };
  }

  return {
    source: 'github-actions',
    plan: planGithubWindow,
    async collect(call, window): Promise<Collected> {
      const rollups: RollupRow[] = [];
      const markers: MarkerRow[] = [];
      let watermark = window.since;
      for (
        let start = window.since;
        start < window.until;
        start += GITHUB_BUCKET_MS
      ) {
        const result = await bucket(call, start);
        const first = start === window.since;
        // A later bucket cut short waits for the next run's full budget.
        if (result.exhausted && !first)
          return { markers, rollups, truncated: true, watermark };
        if (result.exhausted && result.runs.length === 0)
          return { markers, rollups, truncated: true, watermark };
        const rows = bucketRollups(result.runs, start, result.total);
        if (!first && rollups.length + rows.length > MAX_ROLLUP_ROWS)
          return { markers, rollups, truncated: true, watermark };
        rollups.push(...rows);
        for (const run of result.runs) {
          const marker = deployMarker(run);
          // A run listed in two buckets' pages must not be written twice.
          if (
            marker &&
            markers.length < MAX_MARKER_ROWS &&
            !markers.some((seen) => seen.version_id === marker.version_id)
          )
            markers.push(marker);
        }
        watermark = start + GITHUB_BUCKET_MS;
        // The first bucket alone spent the budget: keep it as a sample and
        // move on, so one oversized bucket cannot stall the source.
        if (result.exhausted)
          return { markers, rollups, truncated: true, watermark };
      }
      return { markers, rollups, truncated: false, watermark };
    },
  };
}
