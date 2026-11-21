import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  BUCKET_MS,
  type HealthRange,
  type MarkerInput,
  RANGE_MS,
  type RollupInput,
} from './summary';

// Server loaders for the Admin Health view. Each returns whether its source
// answered, so a failed read is never shown as a measured zero. The caller
// supplies an authorized service-role client.

export type Loaded<T> = { status: 'ok'; data: T } | { status: 'unavailable' };

export interface AnalyticsCell {
  app: string;
  day: string;
  dimension: string;
  metric: string;
  suppressed: boolean;
  value: number | null;
}

export interface SourceRun {
  recorded_at: string;
  source: string;
  status: string;
}

const SUMMARY_STEP_SECONDS = 31 * 24 * 3600;
const SERIES_STEP_SECONDS: Record<HealthRange, number> = {
  '24h': 900,
  '7d': 3600,
  '30d': 6 * 3600,
};
const ANALYTICS_METRICS = [
  'dau',
  'wau',
  'signups',
  'workspaces_created',
  'meet_minutes',
  'meet_participants',
  'meet_meetings',
  'ai_requests',
  'ai_users',
] as const;

/** The window ends at the last closed 15-minute bucket. */
export function healthWindow(now: number, range: HealthRange) {
  const until = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  return { since: until - RANGE_MS[range], until };
}

function rollups(value: unknown): RollupInput[] | null {
  if (!Array.isArray(value)) return null;
  const rows: RollupInput[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;
    if (
      typeof row.service !== 'string' ||
      typeof row.metric !== 'string' ||
      typeof row.bucket_start !== 'string' ||
      typeof row.value !== 'number'
    )
      return null;
    rows.push({
      bucket_start: row.bucket_start,
      metric: row.metric,
      service: row.service,
      value: row.value,
    });
  }
  return rows;
}

async function rollupWindow(
  db: TypedSupabaseClient,
  window: { since: number; until: number },
  step: number,
  service: string | null
): Promise<Loaded<RollupInput[]>> {
  const { data, error } = await db
    .schema('private')
    .rpc('observability_rollup_window', {
      p_since: new Date(window.since).toISOString(),
      p_until: new Date(window.until).toISOString(),
      p_step_seconds: step,
      ...(service ? { p_service: service } : {}),
    });
  const rows = error ? null : rollups(data);
  return rows ? { status: 'ok', data: rows } : { status: 'unavailable' };
}

export function loadServiceSummaryRows(
  db: TypedSupabaseClient,
  window: { since: number; until: number }
) {
  return rollupWindow(db, window, SUMMARY_STEP_SECONDS, null);
}

export function loadServiceSeriesRows(
  db: TypedSupabaseClient,
  window: { since: number; until: number },
  range: HealthRange,
  service: string
) {
  return rollupWindow(db, window, SERIES_STEP_SECONDS[range], service);
}

export async function loadDeployMarkers(
  db: TypedSupabaseClient,
  window: { since: number; until: number }
): Promise<Loaded<MarkerInput[]>> {
  // The latest deploy can predate the window, so read back a further week.
  const { data, error } = await db
    .schema('private')
    .from('observability_deploy_markers')
    .select('service,version_id,deployed_at,sha')
    .gte(
      'deployed_at',
      new Date(window.since - 7 * 24 * 3_600_000).toISOString()
    )
    .lt('deployed_at', new Date(window.until).toISOString())
    .order('deployed_at', { ascending: false })
    .limit(1000);
  return error || !data
    ? { status: 'unavailable' }
    : { status: 'ok', data: data as MarkerInput[] };
}

export async function loadProductAnalytics(
  db: TypedSupabaseClient,
  today: string,
  days = 14
): Promise<Loaded<AnalyticsCell[]>> {
  const since = new Date(
    Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000
  )
    .toISOString()
    .slice(0, 10);
  const { data, error } = await db
    .schema('private')
    .from('product_analytics_daily')
    .select('day,app,metric,dimension,value,suppressed')
    .gte('day', since)
    .lte('day', today)
    .eq('dimension', '')
    .in('metric', [...ANALYTICS_METRICS])
    .order('day', { ascending: true })
    .limit(1000);
  return error || !data
    ? { status: 'unavailable' }
    : { status: 'ok', data: data as AnalyticsCell[] };
}

export async function loadLatestRuns(
  db: TypedSupabaseClient
): Promise<Loaded<SourceRun[]>> {
  const { data, error } = await db
    .schema('private')
    .from('observability_ingest_runs')
    .select('source,status,recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(20);
  return error || !data
    ? { status: 'unavailable' }
    : { status: 'ok', data: data as SourceRun[] };
}
