import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { fetchAllPaginatedRows } from './queue-core';

const FALLBACK_MAX_ROWS = 25_000;
export const POST_EMAIL_QUEUE_DEFAULT_DRAIN_LIMIT = 500;
export const POST_EMAIL_QUEUE_DEFAULT_SEND_LIMIT = 200;
export const POST_EMAIL_QUEUE_MAX_DRAIN_LIMIT = 500;
export const POST_EMAIL_QUEUE_MAX_SEND_LIMIT = 200;

export type PostEmailQueueStatusCount = {
  blocked: number;
  cancelled: number;
  failed: number;
  processing: number;
  queued: number;
  sent: number;
  skipped: number;
  total: number;
};

export type PostEmailQueueWorkspaceSummary = PostEmailQueueStatusCount & {
  oldestQueuedAt: string | null;
  staleQueued1h: number;
  staleQueued24h: number;
  workspaceName: string | null;
  ws_id: string;
};

export type PostEmailQueueAgeBucket = {
  bucket: 'under_1h' | '1h_6h' | '6h_24h' | 'over_24h';
  failed: number;
  processing: number;
  queued: number;
  total: number;
};

export type PostEmailQueueFailureReason = {
  blocked: number;
  failed: number;
  lastSeenAt: string | null;
  reason:
    | 'blocked_recipient'
    | 'missing_delivery_data'
    | 'provider_or_delivery_error'
    | 'rate_limited'
    | 'timeout'
    | 'unknown';
  total: number;
};

export type PostEmailQueueBatchSummary = {
  batch_id: string;
  blocked: number;
  cancelled: number;
  claimed: number;
  durationSeconds: number;
  failed: number;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  processing: number;
  queued: number;
  sent: number;
  skipped: number;
};

export type PostEmailQueueThroughput = {
  failedLast1h: number;
  failedLast24h: number;
  oldestQueuedAt: string | null;
  queuedLast1h: number;
  queuedLast24h: number;
  sentLast1h: number;
  sentLast24h: number;
  staleApprovedQueued1h: number;
  staleApprovedQueued24h: number;
};

export type PostEmailQueueHealth = {
  activeBacklog: number;
  generatedAt: string;
  oldestQueuedAt: string | null;
  staleQueued1h: number;
  staleQueued24h: number;
  status: 'healthy' | 'degraded' | 'critical';
};

export type PostEmailQueueObservability = {
  ageBuckets: PostEmailQueueAgeBucket[];
  byWorkspace: PostEmailQueueWorkspaceSummary[];
  dataSource: 'fallback' | 'rpc';
  failureReasons: PostEmailQueueFailureReason[];
  health: PostEmailQueueHealth;
  recentBatches: PostEmailQueueBatchSummary[];
  summary: PostEmailQueueStatusCount;
  throughput: PostEmailQueueThroughput;
  truncated: boolean;
  workspaceBreakdown: PostEmailQueueWorkspaceSummary[];
};

type RpcResult<T> = {
  data: T[] | T | null;
  error: unknown | null;
};

type PrivateRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<RpcResult<unknown>>;
};

type QueueFallbackRow = {
  attempt_count: number | null;
  batch_id: string | null;
  blocked_reason: string | null;
  cancelled_at: string | null;
  claimed_at: string | null;
  created_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  sent_at: string | null;
  status: string;
  updated_at: string;
  ws_id: string;
};

const EMPTY_SUMMARY: PostEmailQueueStatusCount = {
  blocked: 0,
  cancelled: 0,
  failed: 0,
  processing: 0,
  queued: 0,
  sent: 0,
  skipped: 0,
  total: 0,
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getPrivateRpcClient(
  sbAdmin: TypedSupabaseClient
): PrivateRpcClient | null {
  const maybeSchemaClient = (
    sbAdmin as TypedSupabaseClient & {
      schema?: (schema: 'private') => Partial<PrivateRpcClient>;
    }
  ).schema?.('private');

  return typeof maybeSchemaClient?.rpc === 'function'
    ? (maybeSchemaClient as PrivateRpcClient)
    : null;
}

async function callPrivateRpc<T>(
  client: PrivateRpcClient | null,
  fn: string,
  args?: Record<string, unknown>
): Promise<T[] | null> {
  if (!client) return null;

  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.warn('[PostEmailQueueObservability] RPC unavailable', {
      functionName: fn,
      message:
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: unknown }).message)
            : 'Unknown RPC error',
    });
    return null;
  }

  if (!data) return [];
  return Array.isArray(data) ? (data as T[]) : [data as T];
}

function mapStatusSummary(row: Record<string, unknown> | null | undefined) {
  return {
    blocked: toNumber(row?.blocked),
    cancelled: toNumber(row?.cancelled),
    failed: toNumber(row?.failed),
    processing: toNumber(row?.processing),
    queued: toNumber(row?.queued),
    sent: toNumber(row?.sent),
    skipped: toNumber(row?.skipped),
    total: toNumber(row?.total),
  };
}

function createHealth({
  generatedAt,
  summary,
  throughput,
}: {
  generatedAt: string;
  summary: PostEmailQueueStatusCount;
  throughput: PostEmailQueueThroughput;
}): PostEmailQueueHealth {
  const activeBacklog =
    summary.queued + summary.processing + summary.failed + summary.blocked;
  const staleQueued1h = throughput.staleApprovedQueued1h;
  const staleQueued24h = throughput.staleApprovedQueued24h;
  const status =
    staleQueued24h > 0 || summary.failed + summary.blocked >= 100
      ? 'critical'
      : staleQueued1h > 0 ||
          summary.failed + summary.blocked > 0 ||
          summary.queued >= 1000
        ? 'degraded'
        : 'healthy';

  return {
    activeBacklog,
    generatedAt,
    oldestQueuedAt: throughput.oldestQueuedAt,
    staleQueued1h,
    staleQueued24h,
    status,
  };
}

async function fetchFallbackRows(sbAdmin: TypedSupabaseClient) {
  const rows = await fetchAllPaginatedRows<QueueFallbackRow>(
    (from, to) =>
      sbAdmin
        .from('post_email_queue')
        .select(
          'attempt_count,batch_id,blocked_reason,cancelled_at,claimed_at,created_at,last_attempt_at,last_error,sent_at,status,updated_at,ws_id'
        )
        .order('created_at', { ascending: false })
        .range(from, to),
    { maxRows: FALLBACK_MAX_ROWS }
  );

  return {
    rows,
    truncated: rows.length >= FALLBACK_MAX_ROWS,
  };
}

function incrementStatusCount(
  summary: PostEmailQueueStatusCount,
  status: string | null | undefined
) {
  summary.total++;
  if (status === 'blocked') summary.blocked++;
  else if (status === 'cancelled') summary.cancelled++;
  else if (status === 'failed') summary.failed++;
  else if (status === 'processing') summary.processing++;
  else if (status === 'queued') summary.queued++;
  else if (status === 'sent') summary.sent++;
  else if (status === 'skipped') summary.skipped++;
}

function getAgeBucket(
  createdAt: string,
  nowMs: number
): PostEmailQueueAgeBucket['bucket'] {
  const ageMs = nowMs - new Date(createdAt).getTime();
  if (ageMs < 60 * 60 * 1000) return 'under_1h';
  if (ageMs < 6 * 60 * 60 * 1000) return '1h_6h';
  if (ageMs < 24 * 60 * 60 * 1000) return '6h_24h';
  return 'over_24h';
}

function getFailureReason(
  row: Pick<QueueFallbackRow, 'blocked_reason' | 'last_error' | 'status'>
): PostEmailQueueFailureReason['reason'] {
  const error = row.last_error?.toLowerCase() ?? '';
  if (row.status === 'blocked' || row.blocked_reason) {
    return 'blocked_recipient';
  }
  if (error.includes('rate') || error.includes('limit')) return 'rate_limited';
  if (error.includes('timeout') || error.includes('timed out')) {
    return 'timeout';
  }
  if (error.includes('missing')) return 'missing_delivery_data';
  if (!error) return 'unknown';
  return 'provider_or_delivery_error';
}

function buildFallbackObservability(
  rows: QueueFallbackRow[],
  truncated: boolean,
  generatedAt: string
): PostEmailQueueObservability {
  const nowMs = new Date(generatedAt).getTime();
  const oneHourAgoMs = nowMs - 60 * 60 * 1000;
  const oneDayAgoMs = nowMs - 24 * 60 * 60 * 1000;
  const summary = { ...EMPTY_SUMMARY };
  const workspaceMap = new Map<string, PostEmailQueueWorkspaceSummary>();
  const bucketMap = new Map<
    PostEmailQueueAgeBucket['bucket'],
    PostEmailQueueAgeBucket
  >([
    [
      'under_1h',
      { bucket: 'under_1h', failed: 0, processing: 0, queued: 0, total: 0 },
    ],
    [
      '1h_6h',
      { bucket: '1h_6h', failed: 0, processing: 0, queued: 0, total: 0 },
    ],
    [
      '6h_24h',
      { bucket: '6h_24h', failed: 0, processing: 0, queued: 0, total: 0 },
    ],
    [
      'over_24h',
      { bucket: 'over_24h', failed: 0, processing: 0, queued: 0, total: 0 },
    ],
  ]);
  const failureReasonMap = new Map<string, PostEmailQueueFailureReason>();
  const batchMap = new Map<string, PostEmailQueueBatchSummary>();
  const throughput: PostEmailQueueThroughput = {
    failedLast1h: 0,
    failedLast24h: 0,
    oldestQueuedAt: null,
    queuedLast1h: 0,
    queuedLast24h: 0,
    sentLast1h: 0,
    sentLast24h: 0,
    staleApprovedQueued1h: 0,
    staleApprovedQueued24h: 0,
  };

  for (const row of rows) {
    incrementStatusCount(summary, row.status);

    const workspace =
      workspaceMap.get(row.ws_id) ??
      ({
        ...EMPTY_SUMMARY,
        oldestQueuedAt: null,
        staleQueued1h: 0,
        staleQueued24h: 0,
        workspaceName: null,
        ws_id: row.ws_id,
      } satisfies PostEmailQueueWorkspaceSummary);
    incrementStatusCount(workspace, row.status);

    const createdMs = new Date(row.created_at).getTime();
    if (row.status === 'queued') {
      if (
        !workspace.oldestQueuedAt ||
        row.created_at < workspace.oldestQueuedAt
      ) {
        workspace.oldestQueuedAt = row.created_at;
      }
      if (
        !throughput.oldestQueuedAt ||
        row.created_at < throughput.oldestQueuedAt
      ) {
        throughput.oldestQueuedAt = row.created_at;
      }
      if (createdMs < oneHourAgoMs) {
        workspace.staleQueued1h++;
        throughput.staleApprovedQueued1h++;
      }
      if (createdMs < oneDayAgoMs) {
        workspace.staleQueued24h++;
        throughput.staleApprovedQueued24h++;
      }
    }
    workspaceMap.set(row.ws_id, workspace);

    if (
      row.status === 'queued' ||
      row.status === 'processing' ||
      row.status === 'failed'
    ) {
      const bucket = bucketMap.get(getAgeBucket(row.created_at, nowMs));
      if (bucket) {
        bucket.total++;
        if (row.status === 'queued') bucket.queued++;
        if (row.status === 'processing') bucket.processing++;
        if (row.status === 'failed') bucket.failed++;
      }
    }

    if (row.status === 'failed' || row.status === 'blocked') {
      const reason = getFailureReason(row);
      const entry =
        failureReasonMap.get(reason) ??
        ({
          blocked: 0,
          failed: 0,
          lastSeenAt: null,
          reason,
          total: 0,
        } satisfies PostEmailQueueFailureReason);
      entry.total++;
      if (row.status === 'failed') entry.failed++;
      if (row.status === 'blocked') entry.blocked++;
      const seenAt = row.last_attempt_at ?? row.updated_at ?? row.created_at;
      if (!entry.lastSeenAt || seenAt > entry.lastSeenAt) {
        entry.lastSeenAt = seenAt;
      }
      failureReasonMap.set(reason, entry);
    }

    if (row.batch_id) {
      const attemptedAt =
        row.last_attempt_at ?? row.claimed_at ?? row.created_at;
      const batch =
        batchMap.get(row.batch_id) ??
        ({
          batch_id: row.batch_id,
          blocked: 0,
          cancelled: 0,
          claimed: 0,
          durationSeconds: 0,
          failed: 0,
          first_attempt_at: attemptedAt,
          last_attempt_at: attemptedAt,
          processing: 0,
          queued: 0,
          sent: 0,
          skipped: 0,
        } satisfies PostEmailQueueBatchSummary);

      batch.claimed++;
      if (row.status === 'blocked') batch.blocked++;
      else if (row.status === 'cancelled') batch.cancelled++;
      else if (row.status === 'failed') batch.failed++;
      else if (row.status === 'processing') batch.processing++;
      else if (row.status === 'queued') batch.queued++;
      else if (row.status === 'sent') batch.sent++;
      else if (row.status === 'skipped') batch.skipped++;

      if (batch.first_attempt_at && attemptedAt < batch.first_attempt_at) {
        batch.first_attempt_at = attemptedAt;
      }
      if (!batch.last_attempt_at || attemptedAt > batch.last_attempt_at) {
        batch.last_attempt_at = attemptedAt;
      }
      if (batch.first_attempt_at && batch.last_attempt_at) {
        batch.durationSeconds = Math.max(
          Math.round(
            (new Date(batch.last_attempt_at).getTime() -
              new Date(batch.first_attempt_at).getTime()) /
              1000
          ),
          0
        );
      }
      batchMap.set(row.batch_id, batch);
    }

    if (row.created_at && createdMs >= oneHourAgoMs) throughput.queuedLast1h++;
    if (row.created_at && createdMs >= oneDayAgoMs) throughput.queuedLast24h++;

    const sentMs = row.sent_at ? new Date(row.sent_at).getTime() : 0;
    if (sentMs >= oneHourAgoMs) throughput.sentLast1h++;
    if (sentMs >= oneDayAgoMs) throughput.sentLast24h++;

    const failedAt = row.last_attempt_at ?? row.updated_at;
    const failedMs = failedAt ? new Date(failedAt).getTime() : 0;
    if (row.status === 'failed' && failedMs >= oneHourAgoMs) {
      throughput.failedLast1h++;
    }
    if (row.status === 'failed' && failedMs >= oneDayAgoMs) {
      throughput.failedLast24h++;
    }
  }

  const recentBatches = Array.from(batchMap.values())
    .sort(
      (a, b) =>
        new Date(b.last_attempt_at ?? 0).getTime() -
        new Date(a.last_attempt_at ?? 0).getTime()
    )
    .slice(0, 10);

  const byWorkspace = Array.from(workspaceMap.values())
    .sort(
      (a, b) =>
        b.queued +
        b.processing +
        b.failed +
        b.blocked -
        (a.queued + a.processing + a.failed + a.blocked)
    )
    .slice(0, 20);

  return {
    ageBuckets: Array.from(bucketMap.values()),
    byWorkspace,
    dataSource: 'fallback',
    failureReasons: Array.from(failureReasonMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    health: createHealth({ generatedAt, summary, throughput }),
    recentBatches,
    summary,
    throughput,
    truncated,
    workspaceBreakdown: byWorkspace,
  };
}

export async function getPostEmailQueueObservability(
  sbAdmin: TypedSupabaseClient
): Promise<PostEmailQueueObservability> {
  const generatedAt = new Date().toISOString();
  const privateRpc = getPrivateRpcClient(sbAdmin);
  const [
    summaryRows,
    workspaceRows,
    ageBucketRows,
    failureReasonRows,
    recentBatchRows,
    throughputRows,
  ] = await Promise.all([
    callPrivateRpc<Record<string, unknown>>(
      privateRpc,
      'get_post_email_queue_status_summary',
      { p_ws_id: null }
    ),
    callPrivateRpc<Record<string, unknown>>(
      privateRpc,
      'get_post_email_queue_workspace_breakdown',
      { p_limit: 20, p_now: generatedAt }
    ),
    callPrivateRpc<Record<string, unknown>>(
      privateRpc,
      'get_post_email_queue_age_buckets',
      { p_now: generatedAt }
    ),
    callPrivateRpc<Record<string, unknown>>(
      privateRpc,
      'get_post_email_queue_failure_reasons',
      { p_limit: 10 }
    ),
    callPrivateRpc<Record<string, unknown>>(
      privateRpc,
      'get_post_email_queue_recent_batches',
      { p_limit: 10 }
    ),
    callPrivateRpc<Record<string, unknown>>(
      privateRpc,
      'get_post_email_queue_throughput',
      { p_now: generatedAt }
    ),
  ]);

  if (
    summaryRows &&
    workspaceRows &&
    ageBucketRows &&
    failureReasonRows &&
    recentBatchRows &&
    throughputRows
  ) {
    const summary = mapStatusSummary(summaryRows[0]);
    const throughputRow = throughputRows[0] ?? {};
    const throughput: PostEmailQueueThroughput = {
      failedLast1h: toNumber(throughputRow.failed_last_1h),
      failedLast24h: toNumber(throughputRow.failed_last_24h),
      oldestQueuedAt: toIsoOrNull(throughputRow.oldest_queued_at),
      queuedLast1h: toNumber(throughputRow.queued_last_1h),
      queuedLast24h: toNumber(throughputRow.queued_last_24h),
      sentLast1h: toNumber(throughputRow.sent_last_1h),
      sentLast24h: toNumber(throughputRow.sent_last_24h),
      staleApprovedQueued1h: toNumber(throughputRow.stale_approved_queued_1h),
      staleApprovedQueued24h: toNumber(throughputRow.stale_approved_queued_24h),
    };

    const byWorkspace = workspaceRows.map((row) => ({
      ...mapStatusSummary(row),
      oldestQueuedAt: toIsoOrNull(row.oldest_queued_at),
      staleQueued1h: toNumber(row.stale_queued_1h),
      staleQueued24h: toNumber(row.stale_queued_24h),
      workspaceName: toIsoOrNull(row.workspace_name) ?? null,
      ws_id: String(row.ws_id),
    }));

    return {
      ageBuckets: ageBucketRows.map((row) => ({
        bucket: String(row.bucket_key) as PostEmailQueueAgeBucket['bucket'],
        failed: toNumber(row.failed),
        processing: toNumber(row.processing),
        queued: toNumber(row.queued),
        total: toNumber(row.total),
      })),
      byWorkspace,
      dataSource: 'rpc',
      failureReasons: failureReasonRows.map((row) => ({
        blocked: toNumber(row.blocked),
        failed: toNumber(row.failed),
        lastSeenAt: toIsoOrNull(row.last_seen_at),
        reason: String(
          row.reason ?? 'unknown'
        ) as PostEmailQueueFailureReason['reason'],
        total: toNumber(row.total),
      })),
      health: createHealth({ generatedAt, summary, throughput }),
      recentBatches: recentBatchRows.map((row) => ({
        batch_id: String(row.batch_id),
        blocked: toNumber(row.blocked),
        cancelled: toNumber(row.cancelled),
        claimed: toNumber(row.claimed),
        durationSeconds: toNumber(row.duration_seconds),
        failed: toNumber(row.failed),
        first_attempt_at: toIsoOrNull(row.first_attempt_at),
        last_attempt_at: toIsoOrNull(row.last_attempt_at),
        processing: toNumber(row.processing),
        queued: toNumber(row.queued),
        sent: toNumber(row.sent),
        skipped: toNumber(row.skipped),
      })),
      summary,
      throughput,
      truncated: false,
      workspaceBreakdown: byWorkspace,
    };
  }

  const fallback = await fetchFallbackRows(sbAdmin);
  return buildFallbackObservability(
    fallback.rows,
    fallback.truncated,
    generatedAt
  );
}
