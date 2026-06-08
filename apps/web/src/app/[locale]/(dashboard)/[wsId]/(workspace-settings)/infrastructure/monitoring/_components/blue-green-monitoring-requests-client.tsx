'use client';

import {
  Activity,
  ArrowUpRight,
  Clock,
  Eye,
  FileText,
  Gauge,
  Layers,
  Network,
  Radio,
  Search,
  Server,
  Terminal,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  BlueGreenMonitoringRequestConsoleLog,
  BlueGreenMonitoringRequestLog,
  BlueGreenMonitoringWatcherLog,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import type { ReactNode, RefObject } from 'react';
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  EmptyFilteredState,
  ExplorerPagination,
  FilterSelect,
  MicroPill,
  StatusBadge,
  SummaryMetricCard,
} from './blue-green-monitoring-explorer-shared';
import {
  getMonitoringStatusFamily,
  parseMonitoringRequestPath,
} from './blue-green-monitoring-explorers.utils';
import {
  useBlueGreenMonitoringRequestArchive,
  useBlueGreenMonitoringSnapshot,
} from './blue-green-monitoring-query-hooks';
import {
  BlueGreenMonitoringAlerts,
  BlueGreenMonitoringErrorState,
  BlueGreenMonitoringLoadingState,
} from './blue-green-monitoring-state';
import {
  formatClockTime,
  formatCompactNumber,
  formatDateTime,
  formatLatencyMs,
  formatRelativeTime,
} from './formatters';

const requestTimeframeValues = ['1', '7', '14', '30'] as const;
type MonitoringTranslator = ReturnType<typeof useTranslations>;
type EnrichedMonitoringRequest = BlueGreenMonitoringRequestLog & {
  parsedPath: ReturnType<typeof parseMonitoringRequestPath>;
  statusFamily: ReturnType<typeof getMonitoringStatusFamily>;
  statusValue: string;
};

export function BlueGreenMonitoringRequestsClient() {
  const t = useTranslations('blue-green-monitoring');
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(25).withOptions({ shallow: true })
  );
  const [timeframe, setTimeframe] = useQueryState(
    'timeframe',
    parseAsStringLiteral(requestTimeframeValues)
      .withDefault('7')
      .withOptions({ shallow: true })
  );
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
  const [statusFilter, setStatusFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [renderFilter, setRenderFilter] = useState('all');
  const [trafficFilter, setTrafficFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] =
    useState<BlueGreenMonitoringRequestLog | null>(null);
  const [inspectedRequest, setInspectedRequest] =
    useState<EnrichedMonitoringRequest | null>(null);
  const timeframeDays = Number(timeframe);
  const rootRef = useRef<HTMLElement | null>(null);
  useMonitoringMotion(rootRef);
  const serverSearchValue = deferredSearchValue.trim();

  const archiveQuery = useBlueGreenMonitoringRequestArchive({
    page,
    pageSize,
    q: serverSearchValue || undefined,
    render: renderFilter as 'all' | 'document' | 'rsc',
    route: routeFilter,
    status: statusFilter,
    timeframeDays,
    traffic: trafficFilter as 'all' | 'external' | 'internal',
  });
  const snapshotQuery = useBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 50,
  });

  if (archiveQuery.isPending || snapshotQuery.isPending) {
    return <BlueGreenMonitoringLoadingState includeExplorer />;
  }

  if (
    archiveQuery.error ||
    !archiveQuery.data ||
    snapshotQuery.error ||
    !snapshotQuery.data
  ) {
    return (
      <BlueGreenMonitoringErrorState
        onRetry={() => {
          void archiveQuery.refetch();
          void snapshotQuery.refetch();
        }}
        t={t}
      />
    );
  }

  const archive = archiveQuery.data;
  const snapshot = snapshotQuery.data;
  const archiveAnalytics = archive.analytics;
  const enrichedRequests: EnrichedMonitoringRequest[] = archive.items.map(
    (request) => {
      const parsedPath = parseMonitoringRequestPath(request.path);
      const statusFamily = getMonitoringStatusFamily(request.status);

      return {
        ...request,
        parsedPath,
        statusFamily,
        statusValue:
          request.status != null ? String(request.status) : 'unknown',
      };
    }
  );
  const query = serverSearchValue.toLowerCase();
  const filteredRequests = enrichedRequests.filter((request) => {
    if (statusFilter !== 'all') {
      const matchesStatus =
        request.statusValue === statusFilter ||
        request.statusFamily === statusFilter;

      if (!matchesStatus) {
        return false;
      }
    }

    if (routeFilter !== 'all' && request.parsedPath.pathname !== routeFilter) {
      return false;
    }

    if (
      renderFilter === 'rsc' &&
      !request.parsedPath.isServerComponentRequest
    ) {
      return false;
    }

    if (
      renderFilter === 'document' &&
      request.parsedPath.isServerComponentRequest
    ) {
      return false;
    }

    if (trafficFilter === 'internal' && !request.isInternal) {
      return false;
    }

    if (trafficFilter === 'external' && request.isInternal) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchFields = [
      request.method,
      request.path,
      request.host,
      request.deploymentStamp,
      request.deploymentColor,
      request.deploymentKey,
      request.statusValue,
      request.parsedPath.pathname,
      request.parsedPath.querySignature,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return searchFields.some((value) => value.includes(query));
  });
  const globalRouteSummaries = archiveAnalytics.topRoutes.filter((summary) => {
    if (routeFilter !== 'all' && summary.pathname !== routeFilter) {
      return false;
    }

    if (renderFilter === 'rsc' && !summary.isServerComponentRoute) {
      return false;
    }

    if (renderFilter === 'document' && summary.isServerComponentRoute) {
      return false;
    }

    if (trafficFilter === 'internal' && summary.internalCount === 0) {
      return false;
    }

    if (
      trafficFilter === 'external' &&
      summary.internalCount >= summary.requestCount
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      summary.pathname,
      ...summary.querySignatures,
      ...summary.hostnames,
      ...summary.methods,
    ]
      .map((value) => value.toLowerCase())
      .some((value) => value.includes(query));
  });
  const statusOptions = [
    { label: t('explorer.all_statuses'), value: 'all' },
    { label: t('explorer.status_2xx'), value: '2xx' },
    { label: t('explorer.status_3xx'), value: '3xx' },
    { label: t('explorer.status_4xx'), value: '4xx' },
    { label: t('explorer.status_5xx'), value: '5xx' },
    ...(statusFilter !== 'all' &&
    !['1xx', '2xx', '3xx', '4xx', '5xx'].includes(statusFilter) &&
    !archiveAnalytics.statusCodes.some(
      (value) => String(value) === statusFilter
    )
      ? [
          {
            label: statusFilter,
            value: statusFilter,
          },
        ]
      : []),
    ...archiveAnalytics.statusCodes.map((value) => ({
      label: String(value),
      value: String(value),
    })),
  ];
  const routeOptions = [
    ...(routeFilter !== 'all' &&
    !archiveAnalytics.topRoutes.some(
      (summary) => summary.pathname === routeFilter
    )
      ? [
          {
            label: routeFilter,
            value: routeFilter,
          },
        ]
      : []),
    ...archiveAnalytics.topRoutes.map((summary) => ({
      label: summary.pathname,
      value: summary.pathname,
    })),
  ];
  const errorRequests = filteredRequests.filter(
    (request) =>
      request.statusFamily === '4xx' || request.statusFamily === '5xx'
  );
  const serverErrorRequests = filteredRequests.filter(
    (request) => request.statusFamily === '5xx'
  );
  const slowestRequest = [...filteredRequests].sort(
    (left, right) =>
      (right.requestTimeMs ?? Number.NEGATIVE_INFINITY) -
      (left.requestTimeMs ?? Number.NEGATIVE_INFINITY)
  )[0];
  const focusedRequest =
    inspectedRequest ??
    serverErrorRequests[0] ??
    errorRequests[0] ??
    slowestRequest ??
    filteredRequests[0] ??
    null;
  const focusedRelatedLogs = focusedRequest
    ? getRelatedWatcherLogs(focusedRequest, snapshot.watcher.logs)
    : [];
  const leadingRoute = globalRouteSummaries[0] ?? null;

  return (
    <main
      className="w-full max-w-full space-y-8 overflow-x-hidden"
      ref={rootRef}
    >
      <BlueGreenMonitoringAlerts snapshot={snapshot} t={t} />

      <nav className="monitoring-reveal flex flex-col gap-3 rounded-full border border-border/60 bg-background/80 px-4 py-3 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue">
            <Network className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">
              {t('requests_page.title')}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {t('requests_page.page_refinement')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            {t('requests_page.timeframe_days', { days: timeframeDays })}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {formatCompactNumber(filteredRequests.length)} /{' '}
            {formatCompactNumber(archiveAnalytics.requestCount)}
          </Badge>
          <Badge
            className="rounded-full border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
            variant="outline"
          >
            {formatCompactNumber(errorRequests.length)} {t('ledger.errors')}
          </Badge>
        </div>
      </nav>

      <section className="monitoring-scale relative overflow-hidden rounded-2xl border border-border/60 bg-background p-5 shadow-sm md:p-7">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 mix-blend-luminosity contrast-125 grayscale"
          style={{
            backgroundImage:
              "linear-gradient(90deg, hsl(var(--background)) 0%, transparent 42%, hsl(var(--background)) 100%), url('https://picsum.photos/seed/server-console-observability/1920/1080')",
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--dynamic-blue)/0.18),transparent_35%),radial-gradient(circle_at_85%_25%,hsl(var(--dynamic-red)/0.12),transparent_30%)]"
        />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:items-end">
          <div className="monitoring-reveal">
            <p className="font-medium text-dynamic-blue text-xs uppercase tracking-[0.24em]">
              {t('panels.requests')}
            </p>
            <h1 className="mt-4 max-w-6xl text-[clamp(2.6rem,5vw,5.4rem)] leading-[0.95] tracking-normal">
              {t('requests_page.title')}{' '}
              <span
                aria-hidden
                className="inline-block h-10 w-24 rounded-full align-middle shadow-inner md:h-12 md:w-32"
                style={{
                  backgroundImage:
                    "url('https://picsum.photos/seed/request-trace-lane/320/120')",
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                }}
              />{' '}
              {t('requests_page.trace_lane')}
            </h1>
            <p className="mt-5 max-w-3xl text-muted-foreground text-sm leading-6 md:text-base">
              {t('requests_page.description')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => {
                  startTransition(() => {
                    setStatusFilter('5xx');
                    void setPage(1);
                    setInspectedRequest(serverErrorRequests[0] ?? null);
                  });
                }}
                type="button"
              >
                <Terminal className="mr-2 h-4 w-4" />
                {t('requests_page.error_lens')}
              </Button>
              <Button
                className="rounded-full"
                onClick={() => {
                  startTransition(() => {
                    setSearchValue('');
                    setStatusFilter('all');
                    setRouteFilter('all');
                    setRenderFilter('all');
                    setTrafficFilter('all');
                    void setPage(1);
                    setInspectedRequest(null);
                  });
                }}
                type="button"
                variant="outline"
              >
                {t('explorer.reset_filters')}
              </Button>
            </div>
          </div>

          <div className="grid grid-flow-dense grid-cols-12 gap-3">
            <SignalTile
              className="col-span-12 row-span-2 md:col-span-6"
              icon={<Server className="h-4 w-4" />}
              label={t('requests_page.server_console_lens')}
              meta={t('requests_page.server_console_description')}
              value={
                focusedRequest
                  ? (focusedRequest.parsedPath?.pathname ?? focusedRequest.path)
                  : t('states.none')
              }
            />
            <SignalTile
              className="col-span-6 md:col-span-3"
              icon={<TriangleAlert className="h-4 w-4" />}
              label={t('requests_page.cards.timeframe_errors')}
              meta={t('requests_page.cards.timeframe_errors_description')}
              value={formatCompactNumber(archiveAnalytics.errorRequestCount)}
            />
            <SignalTile
              className="col-span-6 md:col-span-3"
              icon={<Gauge className="h-4 w-4" />}
              label={t('requests_page.slowest_request')}
              meta={slowestRequest?.parsedPath.pathname ?? t('states.none')}
              value={formatLatencyMs(slowestRequest?.requestTimeMs ?? null)}
            />
            <SignalTile
              className="col-span-6 md:col-span-3"
              icon={<Layers className="h-4 w-4" />}
              label={t('explorer.top_routes')}
              meta={leadingRoute?.pathname ?? t('states.none')}
              value={formatCompactNumber(leadingRoute?.requestCount ?? 0)}
            />
            <SignalTile
              className="col-span-6 md:col-span-3"
              icon={<Radio className="h-4 w-4" />}
              label={t('requests_page.related_logs')}
              meta={t('requests_page.related_logs_description')}
              value={formatCompactNumber(focusedRelatedLogs.length)}
            />
          </div>
        </div>
      </section>

      <div className="monitoring-reveal grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          icon={<Activity className="h-4 w-4" />}
          label={t('requests_page.cards.retained')}
          meta={t('requests_page.cards.retained_description', {
            total: formatCompactNumber(archiveAnalytics.retainedRequestCount),
          })}
          value={formatCompactNumber(archiveAnalytics.requestCount)}
        />
        <SummaryMetricCard
          icon={<Network className="h-4 w-4" />}
          label={t('requests_page.cards.served')}
          meta={t('stats.served_requests')}
          value={formatCompactNumber(snapshot.overview.totalRequestsServed)}
        />
        <SummaryMetricCard
          icon={<Radio className="h-4 w-4" />}
          label={t('requests_page.cards.current_rpm')}
          meta={t('stats.requests_per_minute')}
          value={formatCompactNumber(
            snapshot.overview.currentAverageRequestsPerMinute ?? 0
          )}
        />
        <SummaryMetricCard
          icon={<TriangleAlert className="h-4 w-4" />}
          label={t('requests_page.cards.timeframe_errors')}
          meta={t('requests_page.cards.timeframe_errors_description')}
          value={formatCompactNumber(archiveAnalytics.errorRequestCount)}
        />
      </div>

      <section className="monitoring-reveal rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
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
            <Badge variant="secondary" className="rounded-full">
              {t('requests_page.badge', {
                current: archive.page,
                total: archive.pageCount,
              })}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {t('requests_page.timeframe_days', { days: timeframeDays })}
            </Badge>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(6,minmax(0,1fr))]">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-lg border-border/60 pl-10"
                onChange={(event) => {
                  startTransition(() => {
                    setSearchValue(event.target.value);
                    void setPage(1);
                    setInspectedRequest(null);
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
                  void setTimeframe(
                    value as (typeof requestTimeframeValues)[number]
                  );
                  void setPage(1);
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
                  void setPage(1);
                  setInspectedRequest(null);
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
                  void setPage(1);
                  setInspectedRequest(null);
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
                  setRenderFilter(value);
                  void setPage(1);
                  setInspectedRequest(null);
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
                  setTrafficFilter(value);
                  void setPage(1);
                  setInspectedRequest(null);
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
                  void setPageSize(Number(value));
                  void setPage(1);
                });
              }}
              options={[10, 25, 50, 100].map((value) => ({
                label: t('explorer.per_page', { count: value }),
                value: String(value),
              }))}
              value={String(pageSize)}
            />
          </div>

          <p className="mt-3 text-muted-foreground text-xs">
            {t('requests_page.global_refinement', {
              count: formatCompactNumber(archiveAnalytics.requestCount),
            })}
          </p>
        </div>

        {globalRouteSummaries.length > 0 ? (
          <div className="monitoring-scale mt-5 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="mb-4">
              <p className="font-medium text-sm">{t('explorer.top_routes')}</p>
              <p className="text-muted-foreground text-xs">
                {t('requests_page.top_routes_description')}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {globalRouteSummaries.slice(0, 8).map((summary) => {
                const rscShare =
                  summary.requestCount > 0
                    ? (summary.rscCount / summary.requestCount) * 100
                    : 0;

                return (
                  <button
                    key={summary.pathname}
                    className="group overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-4 text-left transition-colors hover:border-dynamic-blue/60 hover:bg-dynamic-blue/5"
                    onClick={() => {
                      startTransition(() => {
                        setRouteFilter(summary.pathname);
                        void setPage(1);
                        setInspectedRequest(null);
                      });
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {summary.pathname}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {summary.querySignatures[0] ??
                            t('explorer.no_query_signature')}
                        </p>
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {formatCompactNumber(summary.requestCount)}
                      </Badge>
                    </div>

                    <div className="mt-4 h-1 overflow-hidden rounded-full bg-border/60">
                      <div
                        className="h-full rounded-full bg-dynamic-blue transition-transform duration-700 ease-out group-hover:scale-x-105"
                        style={{
                          width: `${Math.min(100, Math.max(4, (summary.requestCount / Math.max(leadingRoute?.requestCount ?? 1, 1)) * 100))}%`,
                        }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <MicroPill
                        label={t('stats.avg_latency')}
                        value={formatLatencyMs(summary.averageLatencyMs)}
                      />
                      <MicroPill
                        label={t('ledger.errors')}
                        value={formatCompactNumber(summary.errorCount)}
                      />
                      <MicroPill
                        label={t('requests_page.internal_short')}
                        value={formatCompactNumber(summary.internalCount)}
                      />
                      <MicroPill
                        label={t('explorer.rsc_short')}
                        value={`${Math.round(rscShare)}%`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            icon={<Activity className="h-4 w-4" />}
            label={t('explorer.filtered_requests')}
            meta={t('requests_page.cards.visible_rows')}
            value={formatCompactNumber(filteredRequests.length)}
          />
          <SummaryMetricCard
            icon={<Network className="h-4 w-4" />}
            label={t('explorer.total_routes')}
            meta={t('explorer.unique_routes')}
            value={formatCompactNumber(archiveAnalytics.distinctRoutes)}
          />
          <SummaryMetricCard
            icon={<Radio className="h-4 w-4" />}
            label={t('explorer.rsc_requests')}
            meta={t('explorer.rsc_hint')}
            value={formatCompactNumber(archiveAnalytics.rscRequestCount)}
          />
          <SummaryMetricCard
            icon={<TriangleAlert className="h-4 w-4" />}
            label={t('explorer.error_requests')}
            meta={t('explorer.error_hint')}
            value={formatCompactNumber(archiveAnalytics.errorRequestCount)}
          />
        </div>

        {filteredRequests.length === 0 ? (
          <div className="mt-5">
            <EmptyFilteredState
              actionLabel={t('explorer.reset_filters')}
              description={t('requests_page.empty_filtered')}
              onReset={() => {
                startTransition(() => {
                  setSearchValue('');
                  setStatusFilter('all');
                  setRouteFilter('all');
                  setRenderFilter('all');
                  setTrafficFilter('all');
                  void setPage(1);
                  setInspectedRequest(null);
                });
              }}
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              <div className="border-border/60 border-b px-4 py-3">
                <p className="font-medium text-sm">
                  {t('requests_page.archive_range', {
                    end: Math.min(
                      archive.offset + archive.limit,
                      archive.total
                    ),
                    start: archive.total === 0 ? 0 : archive.offset + 1,
                    total: archive.total,
                  })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('requests_page.archive_window', {
                    visible: filteredRequests.length,
                  })}
                </p>
              </div>

              <Table className="[&_td]:align-top">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('explorer.table_route')}</TableHead>
                    <TableHead>{t('explorer.table_status')}</TableHead>
                    <TableHead>{t('explorer.table_render')}</TableHead>
                    <TableHead>{t('explorer.table_deployment')}</TableHead>
                    <TableHead>{t('explorer.table_latency')}</TableHead>
                    <TableHead>{t('explorer.table_time')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow
                      key={getRequestKey(request)}
                      className={cn(
                        'cursor-pointer',
                        inspectedRequest &&
                          getRequestKey(inspectedRequest) ===
                            getRequestKey(request) &&
                          'bg-dynamic-blue/5'
                      )}
                      onClick={() => {
                        setInspectedRequest(request);
                        setSelectedRequest(request);
                      }}
                    >
                      <TableCell className="min-w-[300px]">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                request.statusFamily === '4xx' ||
                                request.statusFamily === '5xx'
                                  ? 'destructive'
                                  : 'outline'
                              }
                              className="rounded-full"
                            >
                              {request.method ?? 'REQ'}
                            </Badge>
                            <span className="font-medium text-sm">
                              {request.parsedPath.pathname}
                            </span>
                            {request.isInternal ? (
                              <Badge
                                variant="secondary"
                                className="rounded-full"
                              >
                                {t('requests.internal')}
                              </Badge>
                            ) : null}
                            {request.parsedPath.isServerComponentRequest ? (
                              <Badge variant="outline" className="rounded-full">
                                {t('explorer.render_rsc')}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {request.path}
                          </div>
                          <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
                            <span>{request.host ?? t('states.none')}</span>
                            <span>{formatDateTime(request.time)}</span>
                            <span>
                              {request.parsedPath.querySignature ||
                                t('explorer.no_query_signature')}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={
                            request.statusFamily === '5xx'
                              ? 'destructive'
                              : request.statusFamily === '4xx'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {request.status ?? '—'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">
                            {request.parsedPath.isServerComponentRequest
                              ? t('explorer.render_rsc')
                              : t('explorer.render_document')}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {request.isInternal
                              ? t('explorer.traffic_internal')
                              : t('explorer.traffic_external')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">
                            {request.deploymentStamp ??
                              request.deploymentColor ??
                              t('states.none')}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {request.deploymentKey ?? t('states.none')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatLatencyMs(request.requestTimeMs)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">
                            {formatClockTime(request.time)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {formatRelativeTime(request.time)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-border/60 border-t px-4 py-3">
                <ExplorerPagination
                  currentPage={archive.page}
                  onNextPage={() => {
                    startTransition(() => {
                      if (archive.hasNextPage) {
                        void setPage(archive.page + 1);
                      }
                    });
                  }}
                  onPreviousPage={() => {
                    startTransition(() => {
                      if (archive.hasPreviousPage) {
                        void setPage(Math.max(1, archive.page - 1));
                      }
                    });
                  }}
                  t={t}
                  totalItems={archive.total}
                  totalPages={archive.pageCount}
                />
              </div>
            </div>

            <RequestTracePanel
              onOpenDialog={(request) => setSelectedRequest(request)}
              relatedLogs={focusedRelatedLogs}
              request={focusedRequest}
              t={t}
            />
          </div>
        )}
      </section>

      <RequestDetailDialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
          }
        }}
        relatedLogs={snapshot.watcher.logs}
        request={selectedRequest}
        t={t}
      />
    </main>
  );
}

function useMonitoringMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (
      !root ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let mounted = true;
    let context: { revert: () => void } | null = null;

    void import('@tuturuuu/ui/gsap').then(({ ScrollTrigger, gsap }) => {
      if (!mounted || !rootRef.current) {
        return;
      }

      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.fromTo(
          '.monitoring-reveal',
          { opacity: 0, y: 24 },
          {
            duration: 0.7,
            ease: 'power3.out',
            opacity: 1,
            stagger: 0.05,
            y: 0,
          }
        );

        gsap.utils.toArray<HTMLElement>('.monitoring-scale').forEach((item) => {
          gsap.fromTo(
            item,
            { opacity: 0.72, scale: 0.96 },
            {
              ease: 'none',
              opacity: 1,
              scale: 1,
              scrollTrigger: {
                end: 'bottom 20%',
                scrub: true,
                start: 'top 88%',
                trigger: item,
              },
            }
          );
        });

        gsap.utils
          .toArray<HTMLElement>('.monitoring-stack-card')
          .forEach((item, index) => {
            gsap.fromTo(
              item,
              { opacity: 0.82, y: 28 + index * 8 },
              {
                ease: 'power2.out',
                opacity: 1,
                scrollTrigger: {
                  end: 'bottom 70%',
                  scrub: true,
                  start: 'top 95%',
                  trigger: item,
                },
                y: 0,
              }
            );
          });
      }, root);
    });

    return () => {
      mounted = false;
      context?.revert();
    };
  }, [rootRef]);
}

function SignalTile({
  className,
  icon,
  label,
  meta,
  value,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        'monitoring-stack-card group overflow-hidden rounded-xl border border-border/60 bg-background/85 p-4 shadow-sm backdrop-blur transition-colors hover:border-dynamic-blue/50',
        className
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        <span className="text-dynamic-blue">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="mt-3 line-clamp-2 font-semibold text-xl transition-transform duration-700 ease-out group-hover:translate-x-1">
        {value}
      </p>
      <p className="mt-2 line-clamp-3 text-muted-foreground text-xs leading-5">
        {meta}
      </p>
    </div>
  );
}

function RequestTracePanel({
  onOpenDialog,
  relatedLogs,
  request,
  t,
}: {
  onOpenDialog: (request: EnrichedMonitoringRequest) => void;
  relatedLogs: Array<
    BlueGreenMonitoringRequestConsoleLog | BlueGreenMonitoringWatcherLog
  >;
  request: EnrichedMonitoringRequest | null;
  t: MonitoringTranslator;
}) {
  if (!request) {
    return (
      <aside className="monitoring-stack-card rounded-xl border border-border/60 border-dashed bg-muted/20 p-5">
        <p className="font-semibold text-sm">
          {t('requests_page.server_console_lens')}
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          {t('requests_page.server_console_empty')}
        </p>
      </aside>
    );
  }

  return (
    <aside className="monitoring-stack-card h-fit rounded-xl border border-border/60 bg-background p-5 shadow-sm xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
            {t('requests_page.focus_request')}
          </p>
          <h3 className="mt-2 break-words font-semibold text-lg">
            {request.parsedPath.pathname}
          </h3>
        </div>
        <StatusBadge
          tone={
            request.statusFamily === '5xx'
              ? 'destructive'
              : request.statusFamily === '4xx'
                ? 'warning'
                : 'neutral'
          }
        >
          {request.status ?? '—'}
        </StatusBadge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MicroPill
          label={t('explorer.table_latency')}
          value={formatLatencyMs(request.requestTimeMs)}
        />
        <MicroPill
          label={t('explorer.table_render')}
          value={
            request.parsedPath.isServerComponentRequest
              ? t('explorer.render_rsc')
              : t('explorer.render_document')
          }
        />
        <MicroPill
          label={t('requests_page.method')}
          value={request.method ?? t('states.none')}
        />
        <MicroPill
          label={t('requests_page.query_signature')}
          value={
            request.parsedPath.querySignature ||
            t('explorer.no_query_signature')
          }
        />
      </div>

      <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">
              {t('requests_page.server_console_lens')}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('requests_page.console_related_count', {
                count: relatedLogs.length,
              })}
            </p>
          </div>
          <Terminal className="h-4 w-4 text-dynamic-blue" />
        </div>

        <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
          {relatedLogs.length > 0 ? (
            relatedLogs.slice(0, 8).map((log) => (
              <div
                className="rounded-md border border-border/60 bg-background p-3"
                key={`${log.time}-${log.level}-${log.message}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="rounded-full">
                    {log.level}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatDateTime(log.time)}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm">{log.message}</p>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-border/60 bg-background p-3 text-muted-foreground text-sm">
              {t('requests_page.server_console_empty')}
            </p>
          )}
        </div>
      </div>

      <Button
        className="mt-4 w-full rounded-full"
        onClick={() => onOpenDialog(request)}
        type="button"
        variant="outline"
      >
        <Eye className="mr-2 h-4 w-4" />
        {t('requests_page.inspect_request')}
        <ArrowUpRight className="ml-2 h-4 w-4" />
      </Button>
    </aside>
  );
}

function getRequestKey(request: BlueGreenMonitoringRequestLog) {
  return `${request.time}-${request.path}-${request.deploymentKey ?? 'none'}-${request.status ?? 'unknown'}`;
}

function getRelatedWatcherLogs(
  request: BlueGreenMonitoringRequestLog,
  relatedLogs: BlueGreenMonitoringWatcherLog[]
): Array<BlueGreenMonitoringRequestConsoleLog | BlueGreenMonitoringWatcherLog> {
  if (Array.isArray(request.consoleLogs) && request.consoleLogs.length > 0) {
    return request.consoleLogs;
  }

  if (Array.isArray(request.relatedLogs) && request.relatedLogs.length > 0) {
    return request.relatedLogs;
  }

  return relatedLogs.filter((log) => {
    const sameDeployment =
      (request.deploymentKey && log.deploymentKey === request.deploymentKey) ||
      (request.deploymentStamp &&
        log.deploymentStamp === request.deploymentStamp) ||
      (request.deploymentColor && log.activeColor === request.deploymentColor);
    const nearRequest = Math.abs(log.time - request.time) <= 10 * 60 * 1000;

    return sameDeployment || nearRequest;
  });
}

function RequestDetailDialog({
  onOpenChange,
  relatedLogs,
  request,
  t,
}: {
  onOpenChange: (open: boolean) => void;
  relatedLogs: BlueGreenMonitoringWatcherLog[];
  request: BlueGreenMonitoringRequestLog | null;
  t: MonitoringTranslator;
}) {
  const parsedPath = request ? parseMonitoringRequestPath(request.path) : null;
  const requestRelatedLogs = request
    ? getRelatedWatcherLogs(request, relatedLogs)
    : [];
  const details = request
    ? [
        [t('explorer.table_route'), parsedPath?.pathname ?? request.path],
        [t('requests_page.raw_path'), request.path],
        [t('explorer.table_status'), request.status ?? t('states.none')],
        [t('explorer.table_latency'), formatLatencyMs(request.requestTimeMs)],
        [t('explorer.table_time'), formatDateTime(request.time)],
        [t('requests_page.host'), request.host ?? t('states.none')],
        [t('requests_page.method'), request.method ?? t('states.none')],
        [
          t('explorer.table_render'),
          parsedPath?.isServerComponentRequest
            ? t('explorer.render_rsc')
            : t('explorer.render_document'),
        ],
        [
          t('explorer.traffic_filter'),
          request.isInternal
            ? t('explorer.traffic_internal')
            : t('explorer.traffic_external'),
        ],
        [
          t('requests_page.query_signature'),
          parsedPath?.querySignature || t('explorer.no_query_signature'),
        ],
        [
          t('requests_page.deployment_color'),
          request.deploymentColor ?? t('states.none'),
        ],
        [
          t('requests_page.deployment_stamp'),
          request.deploymentStamp ?? t('states.none'),
        ],
        [
          t('requests_page.deployment_key'),
          request.deploymentKey ?? t('states.none'),
        ],
      ]
    : [];

  return (
    <Dialog open={Boolean(request)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-dynamic-blue" />
            {t('requests_page.request_details')}
          </DialogTitle>
          <DialogDescription>
            {request ? request.path : t('states.none')}
          </DialogDescription>
        </DialogHeader>

        {request ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryMetricCard
                icon={<Activity className="h-4 w-4" />}
                label={t('explorer.table_status')}
                meta={t('requests_page.status_family')}
                value={String(request.status ?? '—')}
              />
              <SummaryMetricCard
                icon={<Clock className="h-4 w-4" />}
                label={t('explorer.table_latency')}
                meta={formatRelativeTime(request.time)}
                value={formatLatencyMs(request.requestTimeMs)}
              />
              <SummaryMetricCard
                icon={<Network className="h-4 w-4" />}
                label={t('explorer.table_render')}
                meta={
                  request.isInternal
                    ? t('explorer.traffic_internal')
                    : t('explorer.traffic_external')
                }
                value={
                  parsedPath?.isServerComponentRequest
                    ? t('explorer.render_rsc')
                    : t('explorer.render_document')
                }
              />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20">
              <div className="border-border/60 border-b px-4 py-3">
                <p className="font-medium text-sm">
                  {t('requests_page.request_metadata')}
                </p>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                {details.map(([label, value]) => (
                  <div
                    className="border-border/60 border-b px-4 py-3 md:odd:border-r"
                    key={String(label)}
                  >
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                      {label}
                    </p>
                    <p className="mt-1 break-words font-medium text-sm">
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="font-medium text-sm">
                {t('requests_page.operator_context')}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {t('requests_page.operator_context_description')}
              </p>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-background p-3 text-xs">
                {JSON.stringify(request, null, 2)}
              </pre>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="font-medium text-sm">
                {t('requests_page.related_logs')}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {t('requests_page.related_logs_description')}
              </p>
              <div className="mt-3 space-y-2">
                {requestRelatedLogs.length > 0 ? (
                  requestRelatedLogs.slice(0, 12).map((log) => (
                    <div
                      className="rounded-md border border-border/60 bg-background p-3"
                      key={`${log.time}-${log.level}-${log.message}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className="rounded-full">
                          {log.level}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatDateTime(log.time)}
                        </span>
                        {'deploymentStatus' in log && log.deploymentStatus ? (
                          <span className="text-muted-foreground">
                            {log.deploymentStatus}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 break-words text-sm">{log.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-border/60 bg-background p-3 text-muted-foreground text-sm">
                    {t('requests_page.no_related_logs')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
