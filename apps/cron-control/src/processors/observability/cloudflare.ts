import {
  type CollectWindow,
  type Collected,
  fitRows,
  ProviderError,
  type RollupRow,
  type SourceCollector,
} from './collector';
import { fetchProviderJson, type ProviderFetchDeps } from './provider-fetch';

// Cloudflare GraphQL Analytics collector: Worker invocations and Durable
// Object invocations per script in 15-minute buckets. Read-only token; the
// account id comes from the Worker config.

export const CLOUDFLARE_GRAPHQL_URL =
  'https://api.cloudflare.com/client/v4/graphql';
export const BUCKET_MS = 15 * 60_000;
// Adaptive analytics settle within minutes; a bucket counts as closed once
// its end is this far in the past.
export const SETTLE_MS = 5 * 60_000;
// Reads start at the watermark and catch up at most this many buckets per
// run; data older than the lookback stays a recorded gap.
export const MAX_BUCKETS_PER_RUN = 4;
export const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
// Recent buckets can still be revised, so each run re-reads two of them.
export const REREAD_MS = 2 * BUCKET_MS;
export const GROUP_LIMIT = 10_000;

const SERVICE = /^[a-z0-9][a-z0-9._/-]{0,127}$/;

export const WORKERS_QUERY = `query ObservabilityWorkers($accountTag: string!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(filter: $filter, limit: ${GROUP_LIMIT}) {
        dimensions { scriptName datetimeFifteenMinutes }
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 requestDurationP50 requestDurationP95 requestDurationP99 }
      }
    }
  }
}`;

export const DURABLE_OBJECTS_QUERY = `query ObservabilityDurableObjects($accountTag: string!, $filter: AccountDurableObjectsInvocationsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsInvocationsAdaptiveGroups(filter: $filter, limit: ${GROUP_LIMIT}) {
        dimensions { scriptName datetimeFifteenMinutes }
        sum { requests errors }
      }
    }
  }
}`;

export function planCloudflareWindow(
  now: number,
  watermark: number | null
): CollectWindow | null {
  const closed = Math.floor((now - SETTLE_MS) / BUCKET_MS) * BUCKET_MS;
  const floor = closed - MAX_LOOKBACK_MS;
  // A first run reads only the latest buckets; later runs resume at the
  // watermark, re-reading the two buckets before it.
  const start =
    watermark === null
      ? closed - MAX_BUCKETS_PER_RUN * BUCKET_MS
      : Math.max(floor, watermark - REREAD_MS);
  const since = Math.floor(start / BUCKET_MS) * BUCKET_MS;
  const until = Math.min(closed, since + MAX_BUCKETS_PER_RUN * BUCKET_MS);
  return since < until ? { since, until } : null;
}

type Group = {
  dimensions?: { datetimeFifteenMinutes?: unknown; scriptName?: unknown };
  quantiles?: Record<string, unknown>;
  sum?: Record<string, unknown>;
};

function groupsOf(json: unknown, field: string): Group[] {
  const record = json as {
    data?: { viewer?: { accounts?: Record<string, unknown>[] } };
    errors?: unknown;
  };
  if (Array.isArray(record?.errors) && record.errors.length > 0)
    throw new ProviderError('invalid');
  const groups = record?.data?.viewer?.accounts?.[0]?.[field];
  if (!Array.isArray(groups)) throw new ProviderError('invalid');
  return groups as Group[];
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function bucketOf(group: Group, window: CollectWindow) {
  const service =
    typeof group.dimensions?.scriptName === 'string'
      ? group.dimensions.scriptName.toLowerCase()
      : '';
  const at =
    typeof group.dimensions?.datetimeFifteenMinutes === 'string'
      ? Date.parse(group.dimensions.datetimeFifteenMinutes)
      : Number.NaN;
  if (
    !SERVICE.test(service) ||
    !Number.isFinite(at) ||
    at % BUCKET_MS !== 0 ||
    at < window.since ||
    at >= window.until
  )
    return null;
  return { bucketStart: new Date(at).toISOString(), service };
}

function push(
  rows: RollupRow[],
  bucket: { bucketStart: string; service: string },
  metric: string,
  value: number | null
) {
  if (value === null) return;
  rows.push({
    bucket_seconds: 900,
    bucket_start: bucket.bucketStart,
    metric,
    service: bucket.service,
    value,
  });
}

/** Microseconds to milliseconds, rounded to 0.01 ms. */
function ms(value: unknown) {
  const micros = finite(value);
  return micros === null ? null : Math.round(micros / 10) / 100;
}

export function workerRollups(json: unknown, window: CollectWindow) {
  const groups = groupsOf(json, 'workersInvocationsAdaptive');
  const rows: RollupRow[] = [];
  for (const group of groups) {
    const bucket = bucketOf(group, window);
    if (!bucket) continue;
    push(rows, bucket, 'requests', finite(group.sum?.requests));
    push(rows, bucket, 'errors', finite(group.sum?.errors));
    push(rows, bucket, 'subrequests', finite(group.sum?.subrequests));
    push(rows, bucket, 'cpu_p50_ms', ms(group.quantiles?.cpuTimeP50));
    push(rows, bucket, 'cpu_p99_ms', ms(group.quantiles?.cpuTimeP99));
    push(rows, bucket, 'wall_p50_ms', ms(group.quantiles?.wallTimeP50));
    push(rows, bucket, 'wall_p99_ms', ms(group.quantiles?.wallTimeP99));
    push(
      rows,
      bucket,
      'duration_p50_ms',
      ms(group.quantiles?.requestDurationP50)
    );
    push(
      rows,
      bucket,
      'duration_p95_ms',
      ms(group.quantiles?.requestDurationP95)
    );
    push(
      rows,
      bucket,
      'duration_p99_ms',
      ms(group.quantiles?.requestDurationP99)
    );
  }
  return { rows, truncated: groups.length >= GROUP_LIMIT };
}

export function durableObjectRollups(json: unknown, window: CollectWindow) {
  const groups = groupsOf(json, 'durableObjectsInvocationsAdaptiveGroups');
  // A script can report several groups per bucket (one per namespace).
  const totals = new Map<
    string,
    {
      bucket: { bucketStart: string; service: string };
      errors: number;
      requests: number;
    }
  >();
  for (const group of groups) {
    const bucket = bucketOf(group, window);
    if (!bucket) continue;
    const key = `${bucket.service}\u0000${bucket.bucketStart}`;
    const total = totals.get(key) ?? { bucket, errors: 0, requests: 0 };
    total.requests += finite(group.sum?.requests) ?? 0;
    total.errors += finite(group.sum?.errors) ?? 0;
    totals.set(key, total);
  }
  const rows: RollupRow[] = [];
  for (const total of totals.values()) {
    push(rows, total.bucket, 'do_requests', total.requests);
    push(rows, total.bucket, 'do_errors', total.errors);
  }
  return { rows, truncated: groups.length >= GROUP_LIMIT };
}

export interface CloudflareCollectorDeps extends ProviderFetchDeps {
  accountId: string;
  token: string;
}

/**
 * One read-only GraphQL Analytics request. Shared by every Cron Control
 * collector that reads Cloudflare analytics; the token value comes from
 * CLOUDFLARE_ANALYTICS_API_TOKEN and is only placed in the header.
 */
export async function cloudflareGraphql(
  deps: ProviderFetchDeps & { token: string },
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const { json } = await fetchProviderJson(
    deps,
    new URL(CLOUDFLARE_GRAPHQL_URL),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  return json;
}

export function cloudflareCollector(
  deps: CloudflareCollectorDeps
): SourceCollector {
  function query(query: string, window: CollectWindow) {
    return cloudflareGraphql(deps, query, {
      accountTag: deps.accountId,
      filter: {
        datetime_geq: new Date(window.since).toISOString(),
        datetime_lt: new Date(window.until).toISOString(),
      },
    });
  }

  return {
    source: 'cloudflare-workers',
    plan: planCloudflareWindow,
    async collect(call, window): Promise<Collected> {
      const workers = workerRollups(
        await call(() => query(WORKERS_QUERY, window)),
        window
      );
      const objects = durableObjectRollups(
        await call(() => query(DURABLE_OBJECTS_QUERY, window)),
        window
      );
      // A truncated provider read keeps the watermark, so the next run
      // re-reads; an oversized one keeps the earliest buckets that fit.
      if (workers.truncated || objects.truncated)
        return {
          markers: [],
          rollups: [],
          truncated: true,
          watermark: window.since,
        };
      const fitted = fitRows([...workers.rows, ...objects.rows]);
      return {
        markers: [],
        rollups: fitted.rows,
        truncated: fitted.cutoff !== null,
        watermark: fitted.cutoff ?? window.until,
      };
    },
  };
}
