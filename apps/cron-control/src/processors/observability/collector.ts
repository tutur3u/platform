import type { RunOutcome } from '../../ledger';
import type { ProcessorResult } from '../types';

// Shared run loop for observability collectors. A collector reads one
// provider within a request budget and returns rollup rows; this loop owns the
// database stop fence (mode and generation), the Cron Control fence, dry runs
// and the counts-only run log. It has no Worker imports, so tests inject
// every dependency.

export type ObservabilitySource = 'cloudflare-workers' | 'github-actions';
export type ObservabilityMode = 'dry_run' | 'off' | 'on';

export const MAX_ROLLUP_ROWS = 5_000;
export const MAX_MARKER_ROWS = 200;
export const HARD_REQUEST_CAP = 10;
export const PROVIDER_RESPONSE_MAX_BYTES = 1_048_576;
export const WRITE_RESPONSE_MAX_BYTES = 1_024;

export interface RollupRow {
  bucket_seconds: 900 | 3600;
  bucket_start: string;
  metric: string;
  service: string;
  value: number;
}

export interface MarkerRow {
  deployed_at: string;
  kind: 'deploy' | 'promotion' | 'rollback';
  service: string;
  sha: string | null;
  version_id: string;
}

export interface CollectWindow {
  since: number;
  until: number;
}

export interface Collected {
  markers: MarkerRow[];
  rollups: RollupRow[];
  /** Epoch ms up to which every bucket is complete and written. */
  watermark: number;
  /** True when the request budget ended the read early. */
  truncated: boolean;
}

/**
 * Keeps the earliest whole buckets that fit the row cap. Returns the kept
 * rows and the start of the first dropped bucket, which becomes the
 * watermark so the next run continues from there.
 */
export function fitRows(rows: RollupRow[], cap = MAX_ROLLUP_ROWS) {
  if (rows.length <= cap) return { cutoff: null, rows };
  const sorted = [...rows].sort((a, b) =>
    a.bucket_start < b.bucket_start
      ? -1
      : a.bucket_start > b.bucket_start
        ? 1
        : 0
  );
  const boundary = sorted[cap]!.bucket_start;
  const kept = sorted.filter((row) => row.bucket_start < boundary);
  return { cutoff: Date.parse(boundary), rows: kept };
}

export class BudgetExhausted extends Error {
  constructor() {
    super('Request budget exhausted');
    this.name = 'BudgetExhausted';
  }
}

export class ProviderError extends Error {
  constructor(readonly kind: 'http' | 'invalid' | 'rate-limited') {
    super(`Provider ${kind}`);
    this.name = 'ProviderError';
  }
}

/** One provider request; throws BudgetExhausted before the budget is spent. */
export type ProviderCall = <T>(request: () => Promise<T>) => Promise<T>;

export interface SourceCollector {
  /** Read window for this run, or null when no bucket has closed yet. */
  plan: (now: number, watermark: number | null) => CollectWindow | null;
  collect: (call: ProviderCall, window: CollectWindow) => Promise<Collected>;
  source: ObservabilitySource;
}

export type RpcResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'http'; status: number }
  | { kind: 'invalid' };

export interface CollectorDeps {
  /** Private RPC with the service key; throws on network errors and the deadline. */
  call: (
    rpc: string,
    body: Record<string, unknown>,
    maxBytes?: number
  ) => Promise<RpcResult>;
  collector: SourceCollector;
  /** False once Cron Control stopped the job or its generation changed. */
  fence: () => Promise<boolean>;
  /** Missing provider credentials make the run fail before any request. */
  configured: boolean;
  now: () => number;
}

type Status =
  | 'budget_exhausted'
  | 'done'
  | 'failed'
  | 'stale'
  | 'stopped'
  | 'unknown';

const OUTCOME: Record<Status, RunOutcome> = {
  budget_exhausted: 'ok',
  done: 'ok',
  failed: 'failed',
  stale: 'stopped',
  stopped: 'stopped',
  unknown: 'unknown',
};

interface Control {
  generation: number;
  maxRequests: number;
  mode: ObservabilityMode;
  watermark: number | null;
}

function parseControl(value: unknown): Control | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (record.mode === 'off')
    return { generation: 0, maxRequests: 0, mode: 'off', watermark: null };
  if (record.mode !== 'on' && record.mode !== 'dry_run') return null;
  const { generation, max_requests: maxRequests, watermark } = record;
  if (
    typeof generation !== 'number' ||
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    typeof maxRequests !== 'number' ||
    !Number.isInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > HARD_REQUEST_CAP
  )
    return null;
  let parsedWatermark: number | null = null;
  if (watermark !== null && watermark !== undefined) {
    if (typeof watermark !== 'string') return null;
    parsedWatermark = Date.parse(watermark);
    if (!Number.isFinite(parsedWatermark)) return null;
  }
  return {
    generation,
    maxRequests,
    mode: record.mode,
    watermark: parsedWatermark,
  };
}

function isDeadline(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

export async function runCollector(
  deps: CollectorDeps
): Promise<ProcessorResult> {
  const { collector } = deps;
  const detail: Record<string, number> = {
    requests: 0,
    rollupRows: 0,
    markerRows: 0,
  };
  if (!(await deps.fence())) return { detail, outcome: 'stopped' };

  let begin: RpcResult;
  try {
    begin = await deps.call('observability_begin_ingest', {
      p_source: collector.source,
    });
  } catch (error) {
    return { detail, outcome: isDeadline(error) ? 'unknown' : 'failed' };
  }
  if (begin.kind === 'http') return { detail, outcome: 'failed' };
  const control = begin.kind === 'ok' ? parseControl(begin.value) : null;
  if (!control) return { detail, outcome: 'unknown' };
  if (control.mode === 'off')
    return { detail: { ...detail, off: 1 }, outcome: 'ok' };
  const mode = control.mode;
  if (mode === 'dry_run') detail.dryRun = 1;

  const window = collector.plan(deps.now(), control.watermark);

  async function finish(
    status: Status,
    collectWindow: CollectWindow | null
  ): Promise<ProcessorResult> {
    let recorded: RpcResult;
    try {
      recorded = await deps.call('record_observability_ingest_run', {
        p_source: collector.source,
        p_mode: mode,
        p_status: status,
        p_requests: detail.requests,
        p_rollup_rows: Math.min(detail.rollupRows ?? 0, MAX_ROLLUP_ROWS),
        p_marker_rows: Math.min(detail.markerRows ?? 0, MAX_MARKER_ROWS),
        p_window_start: collectWindow
          ? new Date(collectWindow.since).toISOString()
          : null,
        p_window_end: collectWindow
          ? new Date(collectWindow.until).toISOString()
          : null,
      });
    } catch {
      recorded = { kind: 'invalid' };
    }
    if (recorded.kind !== 'ok') {
      console.error('Observability run log not written', {
        source: collector.source,
        status,
      });
      return { detail: { ...detail, recordFailed: 1 }, outcome: 'failed' };
    }
    const outcome = OUTCOME[status];
    if (outcome !== 'ok')
      console.warn('Observability collector did not complete', {
        source: collector.source,
        status,
        ...detail,
      });
    return { detail, outcome };
  }

  if (!window) return finish('done', null);
  if (!deps.configured) {
    detail.unconfigured = 1;
    return finish('failed', window);
  }

  const call: ProviderCall = async (request) => {
    if (detail.requests >= control.maxRequests) throw new BudgetExhausted();
    if (!(await deps.fence())) throw new DOMException('Stopped', 'AbortError');
    detail.requests++;
    return request();
  };

  let collected: Collected;
  try {
    collected = await collector.collect(call, window);
  } catch (error) {
    if (error instanceof BudgetExhausted) {
      detail.budgetExhausted = 1;
      return finish('budget_exhausted', window);
    }
    if (error instanceof DOMException && error.message === 'Stopped')
      return finish('stopped', window);
    if (error instanceof ProviderError) {
      detail[`provider_${error.kind}`] = 1;
      return finish('failed', window);
    }
    return finish(isDeadline(error) ? 'unknown' : 'failed', window);
  }
  if (
    collected.rollups.length > MAX_ROLLUP_ROWS ||
    collected.markers.length > MAX_MARKER_ROWS
  ) {
    detail.overLimit = 1;
    return finish('failed', window);
  }
  detail.rollupRows = collected.rollups.length;
  detail.markerRows = collected.markers.length;
  if (collected.truncated) detail.budgetExhausted = 1;
  const status: Status = collected.truncated ? 'budget_exhausted' : 'done';
  if (mode === 'dry_run') return finish(status, window);

  if (!(await deps.fence())) return finish('stopped', window);
  let written: RpcResult;
  try {
    written = await deps.call(
      'observability_write_rollups',
      {
        p_source: collector.source,
        p_generation: control.generation,
        p_rollups: collected.rollups,
        p_markers: collected.markers,
        p_watermark: new Date(collected.watermark).toISOString(),
      },
      WRITE_RESPONSE_MAX_BYTES
    );
  } catch (error) {
    return finish(isDeadline(error) ? 'unknown' : 'failed', window);
  }
  if (written.kind === 'http') return finish('failed', window);
  const state =
    written.kind === 'ok' &&
    typeof written.value === 'object' &&
    written.value !== null
      ? (written.value as Record<string, unknown>).state
      : undefined;
  if (state === 'written') return finish(status, window);
  if (state === 'budget') {
    detail.dailyBudget = 1;
    return finish('budget_exhausted', window);
  }
  if (state === 'stale') return finish('stale', window);
  if (state === 'off') return finish('stopped', window);
  if (state === 'invalid') {
    detail.rejected = 1;
    return finish('failed', window);
  }
  return finish('unknown', window);
}
