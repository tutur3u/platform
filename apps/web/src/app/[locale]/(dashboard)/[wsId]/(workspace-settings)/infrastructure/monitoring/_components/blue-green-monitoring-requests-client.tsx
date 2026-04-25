'use client';

import {
  Activity,
  Clock,
  FileText,
  Network,
  Radio,
  Search,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  BlueGreenMonitoringRequestLog,
  BlueGreenMonitoringWatcherLog,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
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
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsStringLiteral, useQueryState } from 'nuqs';
import { startTransition, useDeferredValue, useState } from 'react';
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

const requestTimeframeValues = ['1', '7', '14', '30', '0'] as const;
type MonitoringTranslator = ReturnType<typeof useTranslations>;

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
  const timeframeDays = Number(timeframe);

  const archiveQuery = useBlueGreenMonitoringRequestArchive({
    page,
    pageSize,
    timeframeDays,
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
  const enrichedRequests = archive.items.map((request) => {
    const parsedPath = parseMonitoringRequestPath(request.path);
    const statusFamily = getMonitoringStatusFamily(request.status);

    return {
      ...request,
      parsedPath,
      statusFamily,
      statusValue: request.status != null ? String(request.status) : 'unknown',
    };
  });
  const query = deferredSearchValue.trim().toLowerCase();
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
    ...archiveAnalytics.statusCodes.map((value) => ({
      label: String(value),
      value: String(value),
    })),
  ];
  const routeOptions = archiveAnalytics.topRoutes.map((summary) => ({
    label: summary.pathname,
    value: summary.pathname,
  }));

  return (
    <section className="space-y-6">
      <BlueGreenMonitoringAlerts snapshot={snapshot} t={t} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <section className="rounded-lg border border-border/60 bg-background p-5">
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
              {timeframeDays === 0
                ? t('requests_page.timeframe_all')
                : t('requests_page.timeframe_days', { days: timeframeDays })}
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
                { label: t('requests_page.timeframe_all'), value: '0' },
              ]}
              value={timeframe}
            />

            <FilterSelect
              label={t('explorer.status_filter')}
              onValueChange={setStatusFilter}
              options={statusOptions}
              value={statusFilter}
            />

            <FilterSelect
              label={t('explorer.route_filter')}
              onValueChange={setRouteFilter}
              options={[
                { label: t('explorer.all_routes'), value: 'all' },
                ...routeOptions,
              ]}
              value={routeFilter}
            />

            <FilterSelect
              label={t('explorer.render_filter')}
              onValueChange={setRenderFilter}
              options={[
                { label: t('explorer.render_all'), value: 'all' },
                { label: t('explorer.render_document'), value: 'document' },
                { label: t('explorer.render_rsc'), value: 'rsc' },
              ]}
              value={renderFilter}
            />

            <FilterSelect
              label={t('explorer.traffic_filter')}
              onValueChange={setTrafficFilter}
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
          <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4">
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
                    className="rounded-lg border border-border/60 bg-muted/20 p-4 text-left transition-colors hover:border-dynamic-blue/60 hover:bg-dynamic-blue/5"
                    onClick={() => {
                      startTransition(() => {
                        setRouteFilter(summary.pathname);
                        void setPage(1);
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
                });
              }}
            />
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
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
                    key={`${request.time}-${request.path}-${request.deploymentKey ?? 'none'}-${request.statusValue}`}
                    className="cursor-pointer"
                    onClick={() => setSelectedRequest(request)}
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
                            <Badge variant="secondary" className="rounded-full">
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
    </section>
  );
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
    ? relatedLogs.filter((log) => {
        const sameDeployment =
          (request.deploymentKey &&
            log.deploymentKey === request.deploymentKey) ||
          (request.deploymentStamp &&
            log.deploymentStamp === request.deploymentStamp) ||
          (request.deploymentColor &&
            log.activeColor === request.deploymentColor);
        const nearRequest = Math.abs(log.time - request.time) <= 10 * 60 * 1000;

        return sameDeployment || nearRequest;
      })
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
                        {log.deploymentStatus ? (
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
