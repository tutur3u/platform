import { ArrowLeft } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceApiKey, WorkspaceApiKeyUsageLog } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { usageLogsColumns } from './columns';
import { UsageLogsFilters } from './filters';
import { TimelineChart } from './timeline-chart';

export const metadata: Metadata = {
  title: 'API Key Usage Logs',
  description: 'View detailed usage logs for your API key.',
};

interface Props {
  params: Promise<{
    wsId: string;
    keyId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    from?: string;
    to?: string;
    status?: string;
    method?: string;
  }>;
}

export default async function ApiKeyUsageLogsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('manage_api_keys')) redirect(`/${wsId}/settings`);

        const { keyId } = await params;
        const search = await searchParams;

        const [apiKey, { data: logs, count, stats }, timelineData] =
          await Promise.all([
            getApiKey(wsId, keyId),
            getUsageLogs(wsId, keyId, search),
            getTimelineData(wsId, keyId, search),
          ]);

        const t = await getTranslations('ws-api-keys');

        return (
          <div className="space-y-6">
            <div>
              <Link href={`/${wsId}/api-keys`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('back_to_api_keys')}
                </Button>
              </Link>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-linear-to-br from-foreground/5 to-foreground/10 p-6 md:flex-row md:items-start">
              <div className="flex-1">
                <h1 className="font-bold text-2xl">{t('usage_logs')}</h1>
                <p className="mt-1 text-foreground/70">
                  {t('usage_logs_description')}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <span className="font-medium">{t('api_key')}:</span>
                  <code className="rounded bg-background/80 px-2 py-1 font-mono text-xs">
                    {apiKey.key_prefix}...
                  </code>
                  <span className="text-foreground/60">({apiKey.name})</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('total_requests')}</CardDescription>
                  <CardTitle className="text-3xl">
                    {stats.totalRequests.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-xs">
                    {t('total_api_calls')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('success_rate')}</CardDescription>
                  <CardTitle className="text-3xl">
                    {stats.successRate.toFixed(1)}%
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-xs">
                    {t('successful_requests')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('avg_response_time')}</CardDescription>
                  <CardTitle className="text-3xl">
                    {stats.avgResponseTime.toFixed(0)}ms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-xs">
                    {t('average_latency')}
                  </p>
                </CardContent>
              </Card>
            </div>

            <UsageLogsFilters />

            <TimelineChart data={timelineData} />

            <div>
              <h2 className="mb-4 font-semibold text-lg">
                {t('detailed_logs')}
              </h2>
              <TooltipProvider>
                <CustomDataTable
                  columnGenerator={usageLogsColumns}
                  namespace="api-key-usage-logs-table"
                  data={logs}
                  count={count}
                  defaultVisibility={{
                    id: false,
                    user_agent: false,
                    request_params: false,
                  }}
                />
              </TooltipProvider>
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getApiKey(wsId: string, keyId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_api_keys')
    .select('id, name, key_prefix')
    .eq('ws_id', wsId)
    .eq('id', keyId)
    .single();

  if (error) throw error;

  return data as WorkspaceApiKey;
}

async function getUsageLogs(
  wsId: string,
  keyId: string,
  {
    page = '1',
    pageSize = '10',
    from,
    to,
    status,
    method,
  }: {
    page?: string;
    pageSize?: string;
    from?: string;
    to?: string;
    status?: string;
    method?: string;
  }
) {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('workspace_api_key_usage_logs')
    .select('*', { count: 'exact' })
    .eq('api_key_id', keyId)
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  // Apply filters
  if (from) queryBuilder = queryBuilder.gte('created_at', from);
  if (to) queryBuilder = queryBuilder.lte('created_at', to);
  if (status && status !== 'all') {
    // Handle status code ranges (2xx, 4xx, 5xx, etc.) or specific codes
    if (status.endsWith('xx')) {
      const rangePrefix = status.charAt(0);
      const rangeStart = parseInt(rangePrefix, 10) * 100;
      const rangeEnd = rangeStart + 99;
      queryBuilder = queryBuilder
        .gte('status_code', rangeStart)
        .lte('status_code', rangeEnd);
    } else {
      // Specific status code
      const statusCode = parseInt(status, 10);
      if (!Number.isNaN(statusCode)) {
        queryBuilder = queryBuilder.eq('status_code', statusCode);
      }
    }
  }
  if (method && method !== 'all') {
    queryBuilder = queryBuilder.eq('method', method);
  }

  // Apply pagination
  const parsedPage = parseInt(page, 10);
  const parsedSize = parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = parsedPage * parsedSize - 1;
  queryBuilder = queryBuilder.range(start, end);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  // Calculate statistics
  const statsBuilder = supabase
    .from('workspace_api_key_usage_logs')
    .select('status_code, response_time_ms')
    .eq('api_key_id', keyId)
    .eq('ws_id', wsId);

  let statsQuery = statsBuilder;
  if (from) statsQuery = statsQuery.gte('created_at', from);
  if (to) statsQuery = statsQuery.lte('created_at', to);
  if (status && status !== 'all') {
    if (status.endsWith('xx')) {
      const rangePrefix = status.charAt(0);
      const rangeStart = parseInt(rangePrefix, 10) * 100;
      const rangeEnd = rangeStart + 99;
      statsQuery = statsQuery
        .gte('status_code', rangeStart)
        .lte('status_code', rangeEnd);
    } else {
      const statusCode = parseInt(status, 10);
      if (!Number.isNaN(statusCode)) {
        statsQuery = statsQuery.eq('status_code', statusCode);
      }
    }
  }
  if (method && method !== 'all') {
    statsQuery = statsQuery.eq('method', method);
  }

  const { data: statsData } = await statsQuery;

  const stats = {
    totalRequests: count || 0,
    successRate: 0,
    avgResponseTime: 0,
  };

  if (statsData && statsData.length > 0) {
    const successCount = statsData.filter(
      (log) => log.status_code >= 200 && log.status_code < 300
    ).length;
    stats.successRate = (successCount / statsData.length) * 100;

    const validResponseTimes = statsData
      .filter((log) => log.response_time_ms !== null)
      .map((log) => log.response_time_ms as number);

    if (validResponseTimes.length > 0) {
      stats.avgResponseTime =
        validResponseTimes.reduce((sum, time) => sum + time, 0) /
        validResponseTimes.length;
    }
  }

  return {
    data: (data || []) as WorkspaceApiKeyUsageLog[],
    count: count || 0,
    stats,
  };
}

async function getTimelineData(
  wsId: string,
  keyId: string,
  {
    from,
    to,
    status,
    method,
  }: {
    from?: string;
    to?: string;
    status?: string;
    method?: string;
  }
) {
  const supabase = await createClient();

  // Default to last 30 days if no date range specified
  const endDate = to ? new Date(to) : new Date();
  const startDate = from
    ? new Date(from)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  let queryBuilder = supabase
    .from('workspace_api_key_usage_logs')
    .select('created_at, endpoint, status_code')
    .eq('api_key_id', keyId)
    .eq('ws_id', wsId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: true });

  // Apply status filter
  if (status && status !== 'all') {
    if (status.endsWith('xx')) {
      const rangePrefix = status.charAt(0);
      const rangeStart = parseInt(rangePrefix, 10) * 100;
      const rangeEnd = rangeStart + 99;
      queryBuilder = queryBuilder
        .gte('status_code', rangeStart)
        .lte('status_code', rangeEnd);
    } else {
      const statusCode = parseInt(status, 10);
      if (!Number.isNaN(statusCode)) {
        queryBuilder = queryBuilder.eq('status_code', statusCode);
      }
    }
  }

  // Apply method filter
  if (method && method !== 'all') {
    queryBuilder = queryBuilder.eq('method', method);
  }

  const { data, error } = await queryBuilder;

  if (error) throw error;

  // Aggregate data by day
  const aggregatedData: Record<
    string,
    {
      date: string;
      statusGroups: Record<string, number>;
      endpointGroups: Record<string, number>;
    }
  > = {};

  for (const log of data || []) {
    const dateKey = new Date(log.created_at).toISOString().split('T')[0];
    if (!dateKey) continue;

    if (!aggregatedData[dateKey]) {
      aggregatedData[dateKey] = {
        date: dateKey,
        statusGroups: {},
        endpointGroups: {},
      };
    }

    // Group by status code range
    const statusRange = `${Math.floor(log.status_code / 100)}xx`;
    aggregatedData[dateKey].statusGroups[statusRange] =
      (aggregatedData[dateKey].statusGroups[statusRange] || 0) + 1;

    // Group by endpoint
    const endpoint = log.endpoint || 'unknown';
    aggregatedData[dateKey].endpointGroups[endpoint] =
      (aggregatedData[dateKey].endpointGroups[endpoint] || 0) + 1;
  }

  return Object.values(aggregatedData);
}
