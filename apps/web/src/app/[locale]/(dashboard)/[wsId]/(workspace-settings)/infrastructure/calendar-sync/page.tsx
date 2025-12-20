import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Database,
  Zap,
} from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import ErrorTrackingSection from './_components/error-tracking';
import MetricCards from './_components/metric-cards';
import PerformanceCharts from './_components/performance-charts';
import PerformanceInsights from './_components/performance-insights';
import SyncFilters from './_components/sync-filters';
import SyncLogsPagination from './_components/sync-logs-pagination';
import SyncLogsTable from './_components/sync-logs-table';
import SyncTriggerButton from './_components/sync-trigger-button';
import { getSyncLogs, getSyncMetrics } from './data-fetching';

export const metadata: Metadata = {
  title: 'Calendar Sync Monitoring',
  description:
    'Monitor and optimize calendar synchronization performance across your workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
  }>;
}

export default async function CalendarSyncMonitoringPage({
  params,
  searchParams,
}: Props) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const pageSize = Number(resolvedSearchParams.pageSize) || 50;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Fetch sync metrics for metric cards
        const metrics = await getSyncMetrics(wsId);

        // Prepare metric cards data
        const metricCardsData = [
          {
            title: 'Total Syncs (24h)',
            value: metrics.totalSyncs24h,
            change: metrics.syncGrowthRate,
            changeLabel: 'vs previous 24h',
            trend:
              metrics.syncGrowthRate === null
                ? ('stable' as const)
                : metrics.syncGrowthRate > 0
                  ? ('up' as const)
                  : ('down' as const),
            icon: <Calendar className="h-5 w-5 text-primary" />,
          },
          {
            title: 'Success Rate',
            value: `${metrics.successRate.toFixed(1)}%`,
            change: metrics.successRateChange,
            changeLabel: 'vs previous period',
            trend:
              metrics.successRateChange === null
                ? ('stable' as const)
                : metrics.successRateChange > 0
                  ? ('up' as const)
                  : ('down' as const),
            icon: <Zap className="h-5 w-5 text-green-500" />,
          },
          {
            title: 'Avg Sync Duration',
            value: `${metrics.avgDurationMs.toFixed(0)}ms`,
            change: metrics.durationChange,
            changeLabel: 'vs previous period',
            trend:
              metrics.durationChange === null
                ? ('stable' as const)
                : metrics.durationChange < 0
                  ? ('up' as const)
                  : ('down' as const),
            icon: <Clock className="h-5 w-5 text-blue-500" />,
          },
          {
            title: 'API Calls (24h)',
            value: metrics.totalApiCalls24h,
            icon: <Database className="h-5 w-5 text-purple-500" />,
          },
          {
            title: 'Events Synced (24h)',
            value: metrics.totalEventsSynced24h,
            icon: <Activity className="h-5 w-5 text-orange-500" />,
          },
          {
            title: 'Failed Syncs (24h)',
            value: metrics.failedSyncs24h,
            icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
          },
        ];

        return (
          <>
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="font-bold text-2xl">
                    Calendar Sync Monitoring
                  </h1>
                  <p className="text-foreground/80">
                    Monitor Google Calendar synchronization performance, track
                    errors, and optimize sync operations for your workspace.
                  </p>
                </div>
                <SyncTriggerButton wsId={wsId} />
              </div>
            </div>

            <Separator className="my-4" />

            {/* Key Metrics Cards */}
            <MetricCards metrics={metricCardsData} />

            <Separator className="my-4" />

            {/* Tabbed Analytics Sections */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
                <TabsTrigger value="overview" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="performance" className="gap-2">
                  <Zap className="h-4 w-4" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="errors" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Errors
                </TabsTrigger>
                <TabsTrigger value="logs" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Sync Logs
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <Suspense fallback={<LoadingSkeleton />}>
                  <OverviewContent wsId={wsId} />
                </Suspense>
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance" className="space-y-6">
                <Suspense fallback={<LoadingSkeleton />}>
                  <PerformanceContent wsId={wsId} />
                </Suspense>
              </TabsContent>

              {/* Errors Tab */}
              <TabsContent value="errors" className="space-y-6">
                <Suspense fallback={<LoadingSkeleton />}>
                  <ErrorsContent wsId={wsId} page={page} pageSize={pageSize} />
                </Suspense>
              </TabsContent>

              {/* Sync Logs Tab */}
              <TabsContent value="logs" className="space-y-6">
                <Suspense fallback={<LoadingSkeleton />}>
                  <SyncLogsContent
                    wsId={wsId}
                    page={page}
                    pageSize={pageSize}
                  />
                </Suspense>
              </TabsContent>
            </Tabs>
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function OverviewContent({ wsId }: { wsId: string }) {
  const { logs: syncLogs } = await getSyncLogs(wsId, {
    limit: 100,
    offset: 0,
  });

  return (
    <>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <PerformanceInsights data={syncLogs} />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <PerformanceCharts data={syncLogs} viewType="overview" />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <SyncLogsTable data={syncLogs} compact />
      </div>
    </>
  );
}

async function PerformanceContent({ wsId }: { wsId: string }) {
  const { logs: syncLogs } = await getSyncLogs(wsId, { limit: 200, offset: 0 });

  return (
    <>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <PerformanceInsights data={syncLogs} />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <PerformanceCharts data={syncLogs} viewType="performance" />
      </div>
    </>
  );
}

async function ErrorsContent({
  wsId,
  page,
  pageSize,
}: {
  wsId: string;
  page: number;
  pageSize: number;
}) {
  const offset = (page - 1) * pageSize;
  const { logs: syncLogs, totalCount } = await getSyncLogs(wsId, {
    limit: pageSize,
    offset,
    status: 'failed',
  });

  console.log('[ErrorsContent] Rendering with:', {
    page,
    pageSize,
    offset,
    logsCount: syncLogs.length,
    totalCount,
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <ErrorTrackingSection data={syncLogs} />
      </div>

      {/* Pagination Controls - Prominent Section */}
      <div className="sticky bottom-0 z-10">
        <SyncLogsPagination
          currentPage={page}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      </div>
    </div>
  );
}

async function SyncLogsContent({
  wsId,
  page,
  pageSize,
}: {
  wsId: string;
  page: number;
  pageSize: number;
}) {
  const offset = (page - 1) * pageSize;
  const { logs: syncLogs, totalCount } = await getSyncLogs(wsId, {
    limit: pageSize,
    offset,
  });

  console.log('[SyncLogsContent] Rendering with:', {
    page,
    pageSize,
    offset,
    logsCount: syncLogs.length,
    totalCount,
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-foreground/5 p-4">
        <SyncFilters wsId={wsId} totalCount={totalCount} />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <SyncLogsTable data={syncLogs} />
      </div>

      {/* Pagination Controls - Prominent Section */}
      <div className="sticky bottom-0 z-10">
        <SyncLogsPagination
          currentPage={page}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-foreground/5 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}
