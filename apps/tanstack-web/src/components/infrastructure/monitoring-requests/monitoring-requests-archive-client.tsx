'use client';

import { useSearch } from '@tanstack/react-router';
import {
  Activity,
  Loader2,
  Network,
  Radio,
  Search,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { startTransition, useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  ArchivePagination,
  EmptyArchiveState,
  FilterSelect,
  SummaryMetricCard,
} from './archive-primitives';
import {
  formatCompactNumber,
  formatDateTime,
  formatLatencyMs,
} from './formatters';
import { useBlueGreenMonitoringRequestArchive } from './query-hooks';
import { MonitoringRequestsTable } from './request-table';
import {
  type EnrichedMonitoringRequest,
  enrichMonitoringRequests,
  getRequestKey,
  type MonitoringRenderFilter,
  type MonitoringTrafficFilter,
} from './request-utils';

const TIMEFRAME_VALUES = ['1', '7', '14', '30'] as const;
const PAGE_SIZE_VALUES = [10, 25, 50, 100] as const;

function readNumberSearchValue(
  search: Record<string, unknown>,
  key: string,
  fallback: number
) {
  const value = search[key];
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readLiteralSearchValue<const T extends readonly string[]>(
  search: Record<string, unknown>,
  key: string,
  values: T,
  fallback: T[number]
) {
  const value = search[key];
  return typeof value === 'string' &&
    (values as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

export function MonitoringRequestsArchiveClient({
  initialPage = 1,
  initialPageSize = 25,
  initialTimeframe = '7',
  onPageChange,
}: {
  initialPage?: number;
  initialPageSize?: number;
  initialTimeframe?: (typeof TIMEFRAME_VALUES)[number];
  onPageChange?: (page: number) => void;
}) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const t = useTranslations('blue-green-monitoring');
  const [page, setPageState] = useState(() =>
    readNumberSearchValue(search, 'page', initialPage)
  );
  const [pageSize, setPageSize] = useState(() =>
    readNumberSearchValue(search, 'pageSize', initialPageSize)
  );
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_VALUES)[number]>(
    () =>
      readLiteralSearchValue(
        search,
        'timeframe',
        TIMEFRAME_VALUES,
        initialTimeframe
      )
  );
  const [searchValue, setSearchValue] = useState(
    typeof search.q === 'string' ? search.q : ''
  );
  const deferredSearchValue = useDeferredValue(searchValue);
  const [statusFilter, setStatusFilter] = useState(
    typeof search.status === 'string' ? search.status : 'all'
  );
  const [routeFilter, setRouteFilter] = useState(
    typeof search.route === 'string' ? search.route : 'all'
  );
  const [renderFilter, setRenderFilter] = useState<MonitoringRenderFilter>(
    readLiteralSearchValue(search, 'render', ['all', 'document', 'rsc'], 'all')
  );
  const [trafficFilter, setTrafficFilter] = useState<MonitoringTrafficFilter>(
    readLiteralSearchValue(
      search,
      'traffic',
      ['all', 'external', 'internal'],
      'all'
    )
  );
  const [inspectedRequest, setInspectedRequest] =
    useState<EnrichedMonitoringRequest | null>(null);
  const serverSearchValue = deferredSearchValue.trim();

  const archiveQuery = useBlueGreenMonitoringRequestArchive({
    page,
    pageSize,
    q: serverSearchValue || undefined,
    render: renderFilter,
    route: routeFilter,
    status: statusFilter,
    timeframeDays: Number(timeframe),
    traffic: trafficFilter,
  });

  const archive = archiveQuery.data;
  const enrichedRequests = useMemo(
    () => enrichMonitoringRequests(archive?.items ?? []),
    [archive?.items]
  );
  const analytics = archive?.analytics;
  const routeOptions = useMemo(() => {
    const topRoutes = analytics?.topRoutes ?? [];
    const hasCurrentRoute = topRoutes.some(
      (summary) => summary.pathname === routeFilter
    );

    return [
      ...(routeFilter !== 'all' && !hasCurrentRoute
        ? [{ label: routeFilter, value: routeFilter }]
        : []),
      ...topRoutes.map((summary) => ({
        label: summary.pathname,
        value: summary.pathname,
      })),
    ];
  }, [analytics?.topRoutes, routeFilter]);
  const statusOptions = useMemo(() => {
    const statusCodes = analytics?.statusCodes ?? [];
    const hasCurrentStatus = statusCodes.some(
      (value) => String(value) === statusFilter
    );

    return [
      { label: t('explorer.all_statuses'), value: 'all' },
      { label: t('explorer.status_2xx'), value: '2xx' },
      { label: t('explorer.status_3xx'), value: '3xx' },
      { label: t('explorer.status_4xx'), value: '4xx' },
      { label: t('explorer.status_5xx'), value: '5xx' },
      ...(statusFilter !== 'all' &&
      !['1xx', '2xx', '3xx', '4xx', '5xx'].includes(statusFilter) &&
      !hasCurrentStatus
        ? [{ label: statusFilter, value: statusFilter }]
        : []),
      ...statusCodes.map((value) => ({
        label: String(value),
        value: String(value),
      })),
    ];
  }, [analytics?.statusCodes, statusFilter, t]);

  function setPage(nextPage: number) {
    setPageState(nextPage);
    onPageChange?.(nextPage);
  }

  function resetFilters() {
    startTransition(() => {
      setSearchValue('');
      setStatusFilter('all');
      setRouteFilter('all');
      setRenderFilter('all');
      setTrafficFilter('all');
      setInspectedRequest(null);
      setPage(1);
    });
  }

  if (archiveQuery.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (archiveQuery.isError || !archive || !analytics) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">{t('alerts.failed_title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('alerts.failed_description')}
        </p>
        <Button onClick={() => archiveQuery.refetch()} variant="secondary">
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  const inspectedRequestKey = inspectedRequest
    ? getRequestKey(inspectedRequest)
    : null;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.requests')}
          </p>
          <h2 className="mt-1 font-semibold text-xl">
            {t('requests_page.title')}
          </h2>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            {t('requests_page.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full" variant="secondary">
            {t('requests_page.badge', {
              current: archive.page,
              total: archive.pageCount,
            })}
          </Badge>
          <Badge className="rounded-full" variant="outline">
            {t('requests_page.timeframe_days', { days: Number(timeframe) })}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(6,minmax(0,1fr))]">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-lg border-border/60 pl-10"
              onChange={(event) => {
                startTransition(() => {
                  setSearchValue(event.target.value);
                  setInspectedRequest(null);
                  setPage(1);
                });
              }}
              placeholder={t('explorer.search_requests_placeholder')}
              value={searchValue}
            />
          </div>

          <FilterSelect
            label={t('requests_page.timeframe_filter')}
            onValueChange={(value) => {
              startTransition(() => {
                setTimeframe(value as (typeof TIMEFRAME_VALUES)[number]);
                setInspectedRequest(null);
                setPage(1);
              });
            }}
            options={[
              { label: t('requests_page.timeframe_1d'), value: '1' },
              { label: t('requests_page.timeframe_7d'), value: '7' },
              { label: t('requests_page.timeframe_14d'), value: '14' },
              { label: t('requests_page.timeframe_30d'), value: '30' },
            ]}
            value={timeframe}
          />

          <FilterSelect
            label={t('explorer.status_filter')}
            onValueChange={(value) => {
              startTransition(() => {
                setStatusFilter(value);
                setInspectedRequest(null);
                setPage(1);
              });
            }}
            options={statusOptions}
            value={statusFilter}
          />

          <FilterSelect
            label={t('explorer.route_filter')}
            onValueChange={(value) => {
              startTransition(() => {
                setRouteFilter(value);
                setInspectedRequest(null);
                setPage(1);
              });
            }}
            options={[
              { label: t('explorer.all_routes'), value: 'all' },
              ...routeOptions,
            ]}
            value={routeFilter}
          />

          <FilterSelect
            label={t('explorer.render_filter')}
            onValueChange={(value) => {
              startTransition(() => {
                setRenderFilter(value as MonitoringRenderFilter);
                setInspectedRequest(null);
                setPage(1);
              });
            }}
            options={[
              { label: t('explorer.render_all'), value: 'all' },
              { label: t('explorer.render_document'), value: 'document' },
              { label: t('explorer.render_rsc'), value: 'rsc' },
            ]}
            value={renderFilter}
          />

          <FilterSelect
            label={t('explorer.traffic_filter')}
            onValueChange={(value) => {
              startTransition(() => {
                setTrafficFilter(value as MonitoringTrafficFilter);
                setInspectedRequest(null);
                setPage(1);
              });
            }}
            options={[
              { label: t('explorer.traffic_all'), value: 'all' },
              { label: t('explorer.traffic_external'), value: 'external' },
              { label: t('explorer.traffic_internal'), value: 'internal' },
            ]}
            value={trafficFilter}
          />

          <FilterSelect
            label={t('explorer.page_size')}
            onValueChange={(value) => {
              startTransition(() => {
                setPageSize(Number(value));
                setPage(1);
              });
            }}
            options={PAGE_SIZE_VALUES.map((value) => ({
              label: t('explorer.per_page', { count: value }),
              value: String(value),
            }))}
            value={String(pageSize)}
          />
        </div>

        <p className="mt-3 text-muted-foreground text-xs">
          {t('requests_page.global_refinement', {
            count: formatCompactNumber(analytics.requestCount),
          })}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          icon={<Activity className="h-4 w-4" />}
          label={t('explorer.filtered_requests')}
          meta={t('requests_page.cards.visible_rows')}
          value={formatCompactNumber(enrichedRequests.length)}
        />
        <SummaryMetricCard
          icon={<Network className="h-4 w-4" />}
          label={t('explorer.total_routes')}
          meta={t('explorer.unique_routes')}
          value={formatCompactNumber(analytics.distinctRoutes)}
        />
        <SummaryMetricCard
          icon={<Radio className="h-4 w-4" />}
          label={t('explorer.rsc_requests')}
          meta={t('explorer.rsc_hint')}
          value={formatCompactNumber(analytics.rscRequestCount)}
        />
        <SummaryMetricCard
          icon={<TriangleAlert className="h-4 w-4" />}
          label={t('explorer.error_requests')}
          meta={t('explorer.error_hint')}
          value={formatCompactNumber(analytics.errorRequestCount)}
        />
      </div>

      {enrichedRequests.length === 0 ? (
        <EmptyArchiveState
          actionLabel={t('explorer.reset_filters')}
          description={t('requests_page.empty_filtered')}
          onReset={resetFilters}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
            <div className="border-border/60 border-b px-4 py-3">
              <p className="font-medium text-sm">
                {t('requests_page.archive_range', {
                  end: Math.min(archive.offset + archive.limit, archive.total),
                  start: archive.total === 0 ? 0 : archive.offset + 1,
                  total: archive.total,
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('requests_page.archive_window', {
                  visible: enrichedRequests.length,
                })}
              </p>
            </div>

            <MonitoringRequestsTable
              inspectedRequestKey={inspectedRequestKey}
              onInspect={setInspectedRequest}
              requests={enrichedRequests}
              t={t}
            />

            <div className="border-border/60 border-t px-4 py-3">
              <ArchivePagination
                currentPage={archive.page}
                hasNextPage={archive.hasNextPage}
                hasPreviousPage={archive.hasPreviousPage}
                onNextPage={() => {
                  if (archive.hasNextPage) {
                    setPage(archive.page + 1);
                  }
                }}
                onPreviousPage={() => {
                  if (archive.hasPreviousPage) {
                    setPage(Math.max(1, archive.page - 1));
                  }
                }}
                t={t}
                totalItems={archive.total}
                totalPages={archive.pageCount}
              />
            </div>
          </div>

          <RequestInspectPanel
            request={inspectedRequest ?? enrichedRequests[0] ?? null}
          />
        </div>
      )}
    </section>
  );
}

function RequestInspectPanel({
  request,
}: {
  request: EnrichedMonitoringRequest | null;
}) {
  const t = useTranslations('blue-green-monitoring');

  if (!request) {
    return null;
  }

  return (
    <aside className="rounded-xl border border-border/60 bg-background p-4">
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
          {t('requests_page.server_console_lens')}
        </p>
        <h3 className="mt-2 break-all font-semibold text-lg">
          {request.parsedPath.pathname}
        </h3>
        <p className="mt-2 break-all text-muted-foreground text-xs">
          {request.path}
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        <InspectRow
          label={t('explorer.table_status')}
          value={String(request.status ?? '-')}
        />
        <InspectRow
          label={t('explorer.table_render')}
          value={
            request.parsedPath.isServerComponentRequest
              ? t('explorer.render_rsc')
              : t('explorer.render_document')
          }
        />
        <InspectRow
          label={t('explorer.traffic_filter')}
          value={
            request.isInternal
              ? t('explorer.traffic_internal')
              : t('explorer.traffic_external')
          }
        />
        <InspectRow
          label={t('explorer.table_latency')}
          value={formatLatencyMs(request.requestTimeMs)}
        />
        <InspectRow
          label={t('explorer.table_deployment')}
          value={
            request.deploymentStamp ??
            request.deploymentColor ??
            request.deploymentKey ??
            t('states.none')
          }
        />
        <InspectRow
          label={t('explorer.table_time')}
          value={formatDateTime(request.time)}
        />
      </div>
    </aside>
  );
}

function InspectRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 break-all font-medium text-sm">{value}</p>
    </div>
  );
}
