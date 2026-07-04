import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from '../client';

export type RealtimeAnalyticsMetric = 'requests' | 'users';
export type RealtimeAnalyticsViewMode = 'daily' | 'hourly';

export type RealtimeAnalyticsQuery = {
  channelId?: string;
  endDate: string;
  metric?: RealtimeAnalyticsMetric;
  startDate: string;
  viewMode?: RealtimeAnalyticsViewMode;
  workspaceId?: string;
};

export type RealtimeAnalyticsRow = {
  time_bucket: string;
  total_count: number;
  user_id: string | null;
};

export type RealtimeAnalyticsResponse = {
  data: RealtimeAnalyticsRow[];
  metric: RealtimeAnalyticsMetric;
};

export type RealtimeAnalyticsSummary = {
  avgRequestsPerHour: number;
  errorRate: number;
  peakHour: null | string;
  peakHourCount: number;
  requestsByKind: Record<string, number>;
  totalErrors: number;
  totalRequests: number;
  uniqueChannels: number;
  uniqueUsers: number;
  uniqueWorkspaces: number;
};

export type RealtimeConsumer = {
  errorRate: number;
  errors: number;
  id: string;
  name: string;
  requests: number;
};

export type RealtimeErrorBreakdown = {
  errorRate: number;
  errors: number;
  kind: string;
  total: number;
};

export type RealtimeAnalyticsSummaryResponse = {
  errorBreakdown: RealtimeErrorBreakdown[];
  summary: RealtimeAnalyticsSummary;
  topChannels: RealtimeConsumer[];
  topUsers: RealtimeConsumer[];
  topWorkspaces: RealtimeConsumer[];
};

function realtimeAnalyticsQuery(query: RealtimeAnalyticsQuery) {
  return {
    channelId: query.channelId || undefined,
    endDate: query.endDate,
    metric: query.metric,
    startDate: query.startDate,
    viewMode: query.viewMode,
    workspaceId: query.workspaceId || undefined,
  } satisfies InternalApiQuery;
}

export async function getWorkspaceRealtimeAnalytics(
  wsId: string,
  query: RealtimeAnalyticsQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<RealtimeAnalyticsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/infrastructure/realtime/analytics`,
    {
      cache: 'no-store',
      query: realtimeAnalyticsQuery(query),
    }
  );
}

export async function getWorkspaceRealtimeAnalyticsSummary(
  wsId: string,
  query: Omit<RealtimeAnalyticsQuery, 'metric' | 'viewMode'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<RealtimeAnalyticsSummaryResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/infrastructure/realtime/analytics/summary`,
    {
      cache: 'no-store',
      query: realtimeAnalyticsQuery(query),
    }
  );
}
