import { createClient } from '@tuturuuu/supabase/next/server';
import type { SyncLog } from '@tuturuuu/ui/legacy/calendar/settings/types';

interface SyncMetrics {
  totalSyncs24h: number;
  successRate: number;
  successRateChange: number | null;
  syncGrowthRate: number | null;
  avgDurationMs: number;
  durationChange: number | null;
  totalApiCalls24h: number;
  totalEventsSynced24h: number;
  failedSyncs24h: number;
}

export async function getSyncMetrics(wsId: string): Promise<SyncMetrics> {
  const supabase = await createClient();

  // Get current 24h period
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Fetch last 48h of sync logs for comparison
  const { data: allLogs } = await supabase
    .from('calendar_sync_dashboard')
    .select(
      'id, status, updated_at, timing_total_ms, google_api_calls_count, inserted_events, updated_events, deleted_events'
    )
    .eq('ws_id', wsId)
    .gte('updated_at', fortyEightHoursAgo.toISOString())
    .order('updated_at', { ascending: false });

  if (!allLogs || allLogs.length === 0) {
    return {
      totalSyncs24h: 0,
      successRate: 0,
      successRateChange: null,
      syncGrowthRate: null,
      avgDurationMs: 0,
      durationChange: null,
      totalApiCalls24h: 0,
      totalEventsSynced24h: 0,
      failedSyncs24h: 0,
    };
  }

  // Split into current and previous 24h periods
  const current24h = allLogs.filter(
    (log) => new Date(log.updated_at) >= twentyFourHoursAgo
  );
  const previous24h = allLogs.filter(
    (log) =>
      new Date(log.updated_at) >= fortyEightHoursAgo &&
      new Date(log.updated_at) < twentyFourHoursAgo
  );

  // Calculate current period metrics
  const totalSyncs24h = current24h.length;
  const successfulSyncs24h = current24h.filter(
    (log) => log.status === 'completed'
  ).length;
  const failedSyncs24h = current24h.filter(
    (log) => log.status === 'failed'
  ).length;
  const successRate =
    totalSyncs24h > 0 ? (successfulSyncs24h / totalSyncs24h) * 100 : 0;

  const totalApiCalls24h = current24h.reduce(
    (sum, log) => sum + (log.google_api_calls_count || 0),
    0
  );

  const totalEventsSynced24h = current24h.reduce(
    (sum, log) =>
      sum +
      (log.inserted_events || 0) +
      (log.updated_events || 0) +
      (log.deleted_events || 0),
    0
  );

  const validDurations = current24h
    .filter((log) => log.timing_total_ms && log.timing_total_ms > 0)
    .map((log) => log.timing_total_ms!);

  const avgDurationMs =
    validDurations.length > 0
      ? validDurations.reduce((sum, d) => sum + d, 0) / validDurations.length
      : 0;

  // Calculate previous period metrics for comparison
  const prevTotalSyncs = previous24h.length;
  const prevSuccessfulSyncs = previous24h.filter(
    (log) => log.status === 'completed'
  ).length;
  const prevSuccessRate =
    prevTotalSyncs > 0 ? (prevSuccessfulSyncs / prevTotalSyncs) * 100 : 0;

  const prevValidDurations = previous24h
    .filter((log) => log.timing_total_ms && log.timing_total_ms > 0)
    .map((log) => log.timing_total_ms!);

  const prevAvgDuration =
    prevValidDurations.length > 0
      ? prevValidDurations.reduce((sum, d) => sum + d, 0) /
        prevValidDurations.length
      : 0;

  // Calculate changes
  const successRateChange =
    prevSuccessRate > 0 ? successRate - prevSuccessRate : null;

  const syncGrowthRate =
    prevTotalSyncs > 0
      ? ((totalSyncs24h - prevTotalSyncs) / prevTotalSyncs) * 100
      : null;

  const durationChange =
    prevAvgDuration > 0
      ? ((avgDurationMs - prevAvgDuration) / prevAvgDuration) * 100
      : null;

  return {
    totalSyncs24h,
    successRate,
    successRateChange,
    syncGrowthRate,
    avgDurationMs,
    durationChange,
    totalApiCalls24h,
    totalEventsSynced24h,
    failedSyncs24h,
  };
}

interface GetSyncLogsOptions {
  limit?: number;
  offset?: number;
  status?: 'completed' | 'failed' | 'running';
  orderBy?: 'start_time' | 'updated_at';
  ascending?: boolean;
}

interface GetSyncLogsResult {
  logs: SyncLog[];
  totalCount: number;
  hasMore: boolean;
}

export async function getSyncLogs(
  wsId: string,
  options: GetSyncLogsOptions = {}
): Promise<GetSyncLogsResult> {
  const {
    limit = 50,
    offset = 0,
    status,
    orderBy = 'updated_at',
    ascending = false,
  } = options;

  const supabase = await createClient();

  // Get user for authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Authentication error:', authError);
    return { logs: [], totalCount: 0, hasMore: false };
  }

  // Check workspace access
  const { data: workspaceMemberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', user.id)
    .eq('ws_id', wsId);

  if (membershipError || !workspaceMemberships?.length) {
    console.error('No workspace access:', membershipError);
    return { logs: [], totalCount: 0, hasMore: false };
  }

  // First, get total count
  let countQuery = supabase
    .from('calendar_sync_dashboard')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  if (status) {
    countQuery = countQuery.eq('status', status);
  }

  const { count: totalCount, error: countError } = await countQuery;

  if (countError) {
    console.error('Count error:', countError);
    return { logs: [], totalCount: 0, hasMore: false };
  }

  // Build query for paginated data
  let query = supabase
    .from('calendar_sync_dashboard')
    .select(
      `
      id,
      updated_at,
      start_time,
      type,
      ws_id,
      triggered_by,
      status,
      end_time,
      inserted_events,
      updated_events,
      deleted_events,
      timing_google_api_fetch_ms,
      timing_token_operations_ms,
      timing_event_processing_ms,
      timing_database_writes_ms,
      timing_total_ms,
      google_api_calls_count,
      google_api_pages_fetched,
      google_api_retry_count,
      google_api_error_code,
      events_fetched_total,
      events_filtered_out,
      batch_count,
      payload_size_bytes,
      error_message,
      error_type,
      error_stack_trace,
      failed_event_ids,
      calendar_ids_synced,
      calendar_connection_count,
      was_blocked_by_cooldown,
      cooldown_remaining_seconds,
      sync_token_used,
      date_range_start,
      date_range_end,
      triggered_from,
      workspaces!inner(id, name),
      users!inner(id, display_name, avatar_url)
    `
    )
    .eq('ws_id', wsId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query.order(orderBy, { ascending }).range(offset, offset + limit - 1);

  const { data: syncLogs, error } = await query;

  if (error) {
    console.error('Database error:', error);
    return { logs: [], totalCount: totalCount || 0, hasMore: false };
  }

  if (!syncLogs) {
    return { logs: [], totalCount: totalCount || 0, hasMore: false };
  }

  const processedData = syncLogs.map((item) => {
    const workspace = {
      id: item.workspaces.id,
      name: item.workspaces.name || 'Unknown Workspace',
      color: 'bg-blue-500',
    };

    const user = item.users || null;

    // Calculate duration
    const duration =
      item.end_time && item.start_time
        ? new Date(item.end_time).getTime() -
          new Date(item.start_time).getTime()
        : 0;

    return {
      id: item.id,
      timestamp: item.updated_at || new Date().toISOString(),
      type: item.type as SyncLog['type'],
      workspace: workspace,
      triggeredBy: user
        ? {
            id: user.id,
            display_name: user.display_name || '',
            avatar: user.avatar_url,
          }
        : null,
      status: item.status as SyncLog['status'],
      duration: duration,
      events: {
        added: item.inserted_events || 0,
        updated: item.updated_events || 0,
        deleted: item.deleted_events || 0,
      },
      calendarSource: 'Google Calendar',
      error: item.error_message || null,

      // Performance timing breakdowns
      timings: {
        googleApiFetchMs: item.timing_google_api_fetch_ms,
        tokenOperationsMs: item.timing_token_operations_ms,
        eventProcessingMs: item.timing_event_processing_ms,
        databaseWritesMs: item.timing_database_writes_ms,
        totalMs: item.timing_total_ms,
      },

      // API performance metrics
      apiMetrics: {
        callsCount: item.google_api_calls_count || 0,
        pagesFetched: item.google_api_pages_fetched || 0,
        retryCount: item.google_api_retry_count || 0,
        errorCode: item.google_api_error_code || null,
      },

      // Data volume metrics
      dataVolume: {
        eventsFetchedTotal: item.events_fetched_total || 0,
        eventsFilteredOut: item.events_filtered_out || 0,
        batchCount: item.batch_count || 0,
        payloadSizeBytes: item.payload_size_bytes || null,
      },

      // Error tracking
      errorDetails: {
        message: item.error_message || null,
        type: item.error_type as
          | 'auth'
          | 'network'
          | 'api_limit'
          | 'validation'
          | 'database'
          | 'unknown'
          | null,
        stackTrace: item.error_stack_trace || null,
        failedEventIds:
          item.failed_event_ids && Array.isArray(item.failed_event_ids)
            ? (item.failed_event_ids as string[])
            : null,
      },

      // Calendar-specific metrics
      calendarMetrics: {
        calendarIdsSynced: item.calendar_ids_synced || null,
        connectionCount: item.calendar_connection_count || 0,
      },

      // Sync coordination and context
      syncContext: {
        wasBlockedByCooldown: item.was_blocked_by_cooldown || false,
        cooldownRemainingSeconds: item.cooldown_remaining_seconds || null,
        syncTokenUsed: item.sync_token_used || false,
        dateRangeStart: item.date_range_start || null,
        dateRangeEnd: item.date_range_end || null,
        triggeredFrom: item.triggered_from as
          | 'ui_button'
          | 'auto_refresh'
          | 'trigger_dev'
          | 'api_call'
          | null,
      },
    };
  });

  const hasMore = offset + limit < (totalCount || 0);

  return {
    logs: processedData satisfies SyncLog[],
    totalCount: totalCount || 0,
    hasMore,
  };
}
