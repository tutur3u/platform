'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { RealtimeAnalyticsChart } from './analytics-chart';
import { RealtimeAnalyticsFilters } from './analytics-filters';
import { InsightsPanel } from './insights-panel';
import { MetricComparisons } from './metric-comparisons';
import { RequestBreakdown } from './request-breakdown';
import { SummaryStats } from './summary-stats';
import { TopConsumersTable } from './top-consumers';

interface AnalyticsFilters {
  workspaceId?: string;
  channelId?: string;
  startDate: Date;
  endDate: Date;
  metric: 'requests' | 'users';
  viewMode: 'hourly' | 'daily';
}

interface RawAnalyticsRow {
  time_bucket: string; // UTC timestamp
  total_count: number;
  user_id: string | null;
}

interface RealtimeAnalyticsClientProps {
  wsId: string;
}

export function RealtimeAnalyticsClient({
  wsId,
}: RealtimeAnalyticsClientProps) {
  const t = useTranslations('realtime-analytics');

  // Initialize filters with hourly view for today
  const [filters, setFilters] = useState<AnalyticsFilters>({
    startDate: new Date(new Date().setHours(0, 0, 0, 0)),
    endDate: new Date(new Date().setHours(23, 59, 59, 999)),
    metric: 'requests',
    viewMode: 'hourly',
  });

  // Fetch analytics data with TanStack Query
  const {
    data: rawData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'realtime-analytics',
      wsId,
      filters.workspaceId,
      filters.channelId,
      filters.startDate.toISOString(),
      filters.endDate.toISOString(),
      filters.metric,
      filters.viewMode,
    ],
    queryFn: async () => {
      // Convert local date range to UTC timestamps (best practice)
      const queryParams = new URLSearchParams({
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
        metric: filters.metric,
        viewMode: filters.viewMode,
      });

      if (filters.workspaceId) {
        queryParams.set('workspaceId', filters.workspaceId);
      }

      if (filters.channelId) {
        queryParams.set('channelId', filters.channelId);
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/infrastructure/realtime/analytics?${queryParams}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const result = await response.json();
      return result.data as RawAnalyticsRow[];
    },
    staleTime: 60000, // 1 minute
  });

  // Client-side aggregation: Convert UTC data to local 24-hour slots
  const aggregatedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    if (filters.viewMode === 'hourly') {
      // Create 24 hour buckets (00:00 - 23:00 in LOCAL time)
      const hourBuckets = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        count: 0,
        users: new Set<string>(),
      }));

      // Aggregate raw UTC data into local hour buckets
      for (const row of rawData) {
        // Parse UTC timestamp
        const utcDate = new Date(row.time_bucket);

        // Get local hour (JavaScript Date automatically handles timezone)
        const localHour = utcDate.getHours();

        // Add to the corresponding local hour bucket
        const bucket = hourBuckets[localHour];
        if (!bucket) continue;

        bucket.count += row.total_count || 0;

        if (row.user_id) {
          bucket.users.add(row.user_id);
        }
      }

      // Return aggregated data
      return hourBuckets.map((bucket) => ({
        label: bucket.hour,
        count: filters.metric === 'requests' ? bucket.count : bucket.users.size,
      }));
    }

    // Daily view - aggregate by date
    // Calculate the number of days in the range
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    const dayCount =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    // Create daily buckets
    const dayBuckets = Array.from({ length: dayCount }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return {
        date: date.toISOString().split('T')[0] ?? '', // YYYY-MM-DD format
        count: 0,
        users: new Set<string>(),
      };
    });

    // Aggregate raw UTC data into local date buckets
    for (const row of rawData) {
      // Parse UTC timestamp
      const utcDate = new Date(row.time_bucket);

      // Get local date (JavaScript Date automatically handles timezone)
      const localDateStr = utcDate.toISOString().split('T')[0];

      // Find the corresponding bucket
      const bucket = dayBuckets.find((b) => b.date === localDateStr);
      if (!bucket) continue;

      bucket.count += row.total_count || 0;

      if (row.user_id) {
        bucket.users.add(row.user_id);
      }
    }

    // Return aggregated data
    return dayBuckets.map((bucket) => ({
      label: bucket.date,
      count: filters.metric === 'requests' ? bucket.count : bucket.users.size,
    }));
  }, [
    rawData,
    filters.metric,
    filters.viewMode,
    filters.startDate,
    filters.endDate,
  ]);

  // Fetch workspaces for filter dropdown
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces-list', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces`);
      if (!response.ok) return [];
      const workspaces = await response.json();

      // Deduplicate by ID and filter out invalid UUIDs
      const seen = new Set<string>();
      return workspaces
        .filter((ws: any) => {
          if (!ws.id || seen.has(ws.id)) return false;
          seen.add(ws.id);
          return true;
        })
        .map((ws: any) => ({
          id: ws.id,
          name: ws.name || 'Unnamed Workspace',
        }));
    },
    staleTime: 300000, // 5 minutes
  });

  // Fetch summary statistics and breakdowns
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: [
      'realtime-analytics-summary',
      wsId,
      filters.workspaceId,
      filters.channelId,
      filters.startDate.toISOString(),
      filters.endDate.toISOString(),
    ],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
      });

      if (filters.workspaceId) {
        queryParams.set('workspaceId', filters.workspaceId);
      }

      if (filters.channelId) {
        queryParams.set('channelId', filters.channelId);
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/infrastructure/realtime/analytics/summary?${queryParams}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analytics summary');
      }

      return await response.json();
    },
    staleTime: 60000, // 1 minute
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <RealtimeAnalyticsFilters
        filters={filters}
        onFiltersChange={setFilters}
        workspaces={workspaces}
        isLoadingWorkspaces={false}
      />

      {/* Error State */}
      {(error || summaryError) && (
        <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4">
          <p className="font-medium text-dynamic-red">
            Failed to load analytics data
          </p>
          <p className="text-dynamic-red/80 text-sm">
            {error instanceof Error
              ? error.message
              : summaryError instanceof Error
                ? summaryError.message
                : 'Unknown error occurred'}
          </p>
        </div>
      )}

      {/* Summary Statistics */}
      {summaryData?.summary && (
        <SummaryStats
          summary={summaryData.summary}
          isLoading={isSummaryLoading}
        />
      )}

      {/* Metric Comparisons */}
      {summaryData && (
        <MetricComparisons
          topWorkspaces={summaryData.topWorkspaces || []}
          topUsers={summaryData.topUsers || []}
          totalRequests={summaryData.summary?.totalRequests || 0}
          isLoading={isSummaryLoading}
        />
      )}

      {/* Actionable Insights */}
      {summaryData?.summary && (
        <InsightsPanel
          summary={summaryData.summary}
          topWorkspaces={summaryData.topWorkspaces || []}
          topChannels={summaryData.topChannels || []}
          isLoading={isSummaryLoading}
        />
      )}

      {/* Chart */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 font-semibold text-lg">
          {t('chart.hourly_activity')}
        </h2>
        <RealtimeAnalyticsChart
          data={aggregatedData}
          metric={filters.metric}
          isLoading={isLoading}
        />
      </div>

      {/* Request Type Breakdown and Error Analysis */}
      {summaryData?.summary && (
        <RequestBreakdown
          requestsByKind={summaryData.summary.requestsByKind || {}}
          errorBreakdown={summaryData.errorBreakdown || []}
          isLoading={isSummaryLoading}
        />
      )}

      {/* Top Consumers */}
      {summaryData && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopConsumersTable
            title={t('top_consumers.workspaces')}
            data={summaryData.topWorkspaces || []}
            type="workspace"
            isLoading={isSummaryLoading}
          />
          <TopConsumersTable
            title={t('top_consumers.channels')}
            data={summaryData.topChannels || []}
            type="channel"
            isLoading={isSummaryLoading}
          />
        </div>
      )}

      {summaryData && (
        <TopConsumersTable
          title={t('top_consumers.users')}
          data={summaryData.topUsers || []}
          type="user"
          isLoading={isSummaryLoading}
        />
      )}
    </div>
  );
}
