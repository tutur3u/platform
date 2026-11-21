// Framework-free health summaries over observability rollups. Callers load
// rows (private.observability_rollups and private.observability_deploy_markers)
// and pass them in; nothing here reads requests, time or the network.

export const BUCKET_SECONDS = 900;
export const BUCKET_MS = BUCKET_SECONDS * 1000;

export type HealthRange = '24h' | '7d' | '30d';
export const HEALTH_RANGES: readonly HealthRange[] = ['24h', '7d', '30d'];
export const RANGE_MS: Record<HealthRange, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
  '30d': 30 * 24 * 3_600_000,
};

export interface RollupInput {
  bucket_start: string;
  metric: string;
  service: string;
  value: number;
}

export interface MarkerInput {
  deployed_at: string;
  service: string;
  sha: string | null;
  version_id: string;
}

export type HealthStatus = 'critical' | 'healthy' | 'unavailable' | 'warning';

/** Availability and latency objectives applied until per-service SLOs exist. */
export const DEFAULT_OBJECTIVES = {
  errorRateCritical: 0.05,
  errorRateWarning: 0.01,
  p95CriticalMs: 3_000,
  p95WarningMs: 1_000,
} as const;

export interface ServiceHealth {
  /** Share of the window's buckets that have a rollup. */
  coverage: number;
  cpuP99Ms: number | null;
  doErrorRate: number | null;
  doRequests: number;
  errorRate: number | null;
  errors: number;
  latestDeploy: MarkerInput | null;
  p95Ms: number | null;
  requests: number;
  requestsPerMinute: number | null;
  service: string;
  status: HealthStatus;
}

export interface SeriesPoint {
  at: string;
  cpuP99Ms: number | null;
  errorRate: number | null;
  p95Ms: number | null;
  requests: number | null;
}

/** Worker script names map to app slugs for deploy correlation. */
export function appForService(service: string) {
  const match = /^tuturuuu-([a-z0-9-]+?)(?:-staging|-production)?$/.exec(
    service
  );
  return match?.[1] ?? service;
}

// Apps whose deploy workflow also ships helper Workers named after them
// (for example tuturuuu-meet-realtime, tuturuuu-web-api-identity). Every
// other app matches only its own Worker, since names such as
// tuturuuu-chat-realtime and tuturuuu-mastermind-store have their own
// deploy workflows.
const PARENT_DEPLOY_APPS = new Set(['meet', 'web']);

/** Whether a deploy marker (an app slug such as `meet`) belongs to a Worker. */
export function markerMatches(service: string, markerService: string) {
  if (markerService === service) return true;
  const app = appForService(service);
  return (
    app === markerService ||
    (PARENT_DEPLOY_APPS.has(markerService) &&
      app.startsWith(`${markerService}-`))
  );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/** Request-weighted mean of a per-bucket quantile, as an approximation. */
function weighted(
  buckets: Map<string, Record<string, number>>,
  metric: string
) {
  let weight = 0;
  let total = 0;
  for (const bucket of buckets.values()) {
    const value = bucket[metric];
    const requests = bucket.requests ?? 0;
    if (value === undefined || requests <= 0) continue;
    weight += requests;
    total += value * requests;
  }
  return weight > 0 ? total / weight : null;
}

function statusOf(
  coverage: number,
  errorRate: number | null,
  p95Ms: number | null
): HealthStatus {
  if (coverage < 0.75 || errorRate === null || p95Ms === null)
    return 'unavailable';
  const objectives = DEFAULT_OBJECTIVES;
  if (
    (errorRate ?? 0) >= objectives.errorRateCritical ||
    (p95Ms ?? 0) >= objectives.p95CriticalMs
  )
    return 'critical';
  if (
    (errorRate ?? 0) >= objectives.errorRateWarning ||
    (p95Ms ?? 0) >= objectives.p95WarningMs
  )
    return 'warning';
  return 'healthy';
}

function groupByService(rows: RollupInput[], since: number, until: number) {
  const services = new Map<string, Map<string, Record<string, number>>>();
  for (const row of rows) {
    const at = Date.parse(row.bucket_start);
    if (!Number.isFinite(at) || at < since || at >= until) continue;
    const buckets = services.get(row.service) ?? new Map();
    services.set(row.service, buckets);
    const bucket = buckets.get(row.bucket_start) ?? {};
    buckets.set(row.bucket_start, bucket);
    bucket[row.metric] = row.value;
  }
  return services;
}

export function latestDeploy(markers: MarkerInput[], service: string) {
  let latest: MarkerInput | null = null;
  for (const marker of markers) {
    if (!markerMatches(service, marker.service)) continue;
    if (!latest || marker.deployed_at > latest.deployed_at) latest = marker;
  }
  return latest;
}

export function summarizeServices(
  rows: RollupInput[],
  markers: MarkerInput[],
  window: { since: number; until: number }
): ServiceHealth[] {
  const expected = Math.max(
    1,
    Math.round((window.until - window.since) / BUCKET_MS)
  );
  const minutes = (window.until - window.since) / 60_000;
  const summaries: ServiceHealth[] = [];
  for (const [service, buckets] of groupByService(
    rows,
    window.since,
    window.until
  )) {
    const values = [...buckets.values()];
    const requests = sum(values.map((bucket) => bucket.requests ?? 0));
    const errors = sum(values.map((bucket) => bucket.errors ?? 0));
    const doRequests = sum(values.map((bucket) => bucket.do_requests ?? 0));
    const doErrors = sum(values.map((bucket) => bucket.do_errors ?? 0));
    // Window-aggregated rows carry a `buckets` count; raw rows count one each.
    const covered = sum(
      values.map(
        (bucket) =>
          bucket.buckets ??
          (bucket.requests !== undefined || bucket.do_requests !== undefined
            ? 1
            : 0)
      )
    );
    const coverage = Math.min(1, covered / expected);
    const errorRate = requests > 0 ? errors / requests : null;
    const p95Ms = weighted(buckets, 'duration_p95_ms');
    summaries.push({
      coverage,
      cpuP99Ms: weighted(buckets, 'cpu_p99_ms'),
      doErrorRate: doRequests > 0 ? doErrors / doRequests : null,
      doRequests,
      errorRate,
      errors,
      latestDeploy: latestDeploy(markers, service),
      p95Ms,
      requests,
      requestsPerMinute: minutes > 0 ? requests / minutes : null,
      service,
      status: statusOf(coverage, errorRate, p95Ms),
    });
  }
  const order: Record<HealthStatus, number> = {
    critical: 0,
    warning: 1,
    unavailable: 2,
    healthy: 3,
  };
  return summaries.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      b.requests - a.requests ||
      a.service.localeCompare(b.service)
  );
}

/**
 * One point per bucket in the window, oldest first. Missing buckets stay
 * null so charts show gaps instead of zeros. Long ranges are merged into
 * hourly or six-hour points to bound the series length.
 */
export function serviceSeries(
  rows: RollupInput[],
  service: string,
  window: { since: number; until: number }
): SeriesPoint[] {
  const span = window.until - window.since;
  const step =
    span > 8 * 24 * 3_600_000
      ? 6 * 3_600_000
      : span > 2 * 24 * 3_600_000
        ? 3_600_000
        : BUCKET_MS;
  const buckets =
    groupByService(
      rows.filter((row) => row.service === service),
      window.since,
      window.until
    ).get(service) ?? new Map<string, Record<string, number>>();
  // Points are anchored at the window start, like the read RPC's steps.
  const anchor = (time: number) =>
    window.since + Math.floor((time - window.since) / step) * step;
  const merged = new Map<number, Map<string, Record<string, number>>>();
  for (const [start, bucket] of buckets) {
    const at = anchor(Date.parse(start));
    const group = merged.get(at) ?? new Map();
    merged.set(at, group);
    group.set(start, bucket);
  }
  const points: SeriesPoint[] = [];
  for (let at = window.since; at < window.until; at += step) {
    const group = merged.get(at);
    if (!group) {
      points.push({
        at: new Date(at).toISOString(),
        cpuP99Ms: null,
        errorRate: null,
        p95Ms: null,
        requests: null,
      });
      continue;
    }
    const values = [...group.values()];
    const requests = sum(values.map((bucket) => bucket.requests ?? 0));
    const errors = sum(values.map((bucket) => bucket.errors ?? 0));
    points.push({
      at: new Date(at).toISOString(),
      cpuP99Ms: weighted(group, 'cpu_p99_ms'),
      errorRate: requests > 0 ? errors / requests : null,
      p95Ms: weighted(group, 'duration_p95_ms'),
      requests,
    });
  }
  return points;
}

export function parseRange(value: string | string[] | undefined): HealthRange {
  return typeof value === 'string' &&
    (HEALTH_RANGES as string[]).includes(value)
    ? (value as HealthRange)
    : '24h';
}

const SERVICE = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
export function parseService(value: string | string[] | undefined) {
  return typeof value === 'string' && SERVICE.test(value) ? value : null;
}
