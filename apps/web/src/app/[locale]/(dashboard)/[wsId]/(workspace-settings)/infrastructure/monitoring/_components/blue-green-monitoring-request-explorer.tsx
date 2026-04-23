'use client';

import {
  Activity,
  Network,
  Radio,
  Search,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { BlueGreenMonitoringRequestLog } from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
import { startTransition, useDeferredValue, useState } from 'react';
import {
  EmptyFilteredState,
  ExplorerPagination,
  FilterSelect,
  getSafePage,
  getTotalPages,
  MicroPill,
  PAGE_SIZE_OPTIONS,
  PaginationSummary,
  paginateItems,
  StatusBadge,
  SummaryMetricCard,
} from './blue-green-monitoring-explorer-shared';
import {
  buildMonitoringRouteSummaries,
  getMonitoringStatusFamily,
  parseMonitoringRequestPath,
} from './blue-green-monitoring-explorers.utils';
import {
  formatClockTime,
  formatCompactNumber,
  formatDateTime,
  formatLatencyMs,
  formatRelativeTime,
} from './formatters';

export function RecentRequestsPanel({
  requests,
}: {
  requests: BlueGreenMonitoringRequestLog[];
}) {
  const t = useTranslations('blue-green-monitoring');
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
  const [statusFilter, setStatusFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [renderFilter, setRenderFilter] = useState('all');
  const [trafficFilter, setTrafficFilter] = useState('all');
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>('10');
  const [page, setPage] = useState(1);

  const enrichedRequests = requests.map((request) => {
    const parsedPath = parseMonitoringRequestPath(request.path);
    const statusFamily = getMonitoringStatusFamily(request.status);

    return {
      ...request,
      parsedPath,
      statusFamily,
      statusValue: request.status != null ? String(request.status) : 'unknown',
    };
  });
  const routeSummaries = buildMonitoringRouteSummaries(requests);
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
  const currentPage = getSafePage(
    page,
    filteredRequests.length,
    Number(pageSize)
  );
  const pagedRequests = paginateItems(
    filteredRequests,
    currentPage,
    Number(pageSize)
  );
  const distinctRoutes = new Set(
    filteredRequests.map((request) => request.parsedPath.pathname)
  );
  const rscRequestCount = filteredRequests.filter(
    (request) => request.parsedPath.isServerComponentRequest
  ).length;
  const errorRequestCount = filteredRequests.filter(
    (request) => (request.status ?? 0) >= 400
  ).length;
  const statusOptions = [
    { label: t('explorer.all_statuses'), value: 'all' },
    { label: t('explorer.status_2xx'), value: '2xx' },
    { label: t('explorer.status_3xx'), value: '3xx' },
    { label: t('explorer.status_4xx'), value: '4xx' },
    { label: t('explorer.status_5xx'), value: '5xx' },
    ...[...new Set(enrichedRequests.map((request) => request.statusValue))]
      .filter(
        (value) => !['unknown', '2xx', '3xx', '4xx', '5xx'].includes(value)
      )
      .sort((left, right) => Number(left) - Number(right))
      .map((value) => ({ label: value, value })),
  ];

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-background/80 p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.requests')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('panels.recent_requests')}
            </h3>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              {t('explorer.requests_description')}
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {filteredRequests.length} / {requests.length} {t('logs.entries')}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            icon={<Activity className="h-4 w-4" />}
            label={t('explorer.filtered_requests')}
            meta={t('explorer.pagination_status', {
              current: pagedRequests.length === 0 ? 0 : pagedRequests.length,
              total: filteredRequests.length,
            })}
            value={formatCompactNumber(filteredRequests.length)}
          />
          <SummaryMetricCard
            icon={<Network className="h-4 w-4" />}
            label={t('explorer.total_routes')}
            meta={t('explorer.unique_routes')}
            value={formatCompactNumber(distinctRoutes.size)}
          />
          <SummaryMetricCard
            icon={<Radio className="h-4 w-4" />}
            label={t('explorer.rsc_requests')}
            meta={t('explorer.rsc_hint')}
            value={formatCompactNumber(rscRequestCount)}
          />
          <SummaryMetricCard
            icon={<TriangleAlert className="h-4 w-4" />}
            label={t('explorer.error_requests')}
            meta={t('explorer.error_hint')}
            value={formatCompactNumber(errorRequestCount)}
          />
        </div>

        <div className="rounded-[1.75rem] border border-border/60 bg-background/70 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(5,minmax(0,1fr))]">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-2xl border-border/60 pl-10"
                onChange={(event) => {
                  startTransition(() => {
                    setSearchValue(event.target.value);
                    setPage(1);
                  });
                }}
                placeholder={t('explorer.search_requests_placeholder')}
                value={searchValue}
              />
            </div>

            <FilterSelect
              label={t('explorer.status_filter')}
              onValueChange={(value) => {
                startTransition(() => {
                  setStatusFilter(value);
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
                  setPage(1);
                });
              }}
              options={[
                { label: t('explorer.all_routes'), value: 'all' },
                ...routeSummaries.map((summary) => ({
                  label: summary.pathname,
                  value: summary.pathname,
                })),
              ]}
              value={routeFilter}
            />

            <FilterSelect
              label={t('explorer.render_filter')}
              onValueChange={(value) => {
                startTransition(() => {
                  setRenderFilter(value);
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
                  setTrafficFilter(value);
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
                  setPageSize(value as (typeof PAGE_SIZE_OPTIONS)[number]);
                  setPage(1);
                });
              }}
              options={PAGE_SIZE_OPTIONS.map((value) => ({
                label: t('explorer.per_page', { count: Number(value) }),
                value,
              }))}
              value={pageSize}
            />
          </div>
        </div>

        {routeSummaries.length > 0 ? (
          <div className="rounded-[1.75rem] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.12),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.18),transparent_28%),linear-gradient(135deg,rgba(10,14,24,0.96),rgba(15,23,42,0.92))]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">
                  {t('explorer.top_routes')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('explorer.top_routes_description')}
                </p>
              </div>
              {routeFilter !== 'all' ? (
                <Button
                  className="rounded-full"
                  onClick={() => {
                    startTransition(() => {
                      setRouteFilter('all');
                      setPage(1);
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  {t('explorer.clear_route_filter')}
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {routeSummaries.slice(0, 8).map((summary) => {
                const isActive = routeFilter === summary.pathname;
                const rscShare =
                  summary.requestCount > 0
                    ? (summary.rscCount / summary.requestCount) * 100
                    : 0;

                return (
                  <button
                    type="button"
                    key={summary.pathname}
                    className={cn(
                      'rounded-[1.5rem] border p-4 text-left transition-colors',
                      isActive
                        ? 'border-dynamic-blue/40 bg-dynamic-blue/10'
                        : 'border-border/60 bg-background/75 hover:border-dynamic-blue/30'
                    )}
                    onClick={() => {
                      startTransition(() => {
                        setRouteFilter((current) =>
                          current === summary.pathname
                            ? 'all'
                            : summary.pathname
                        );
                        setPage(1);
                      });
                    }}
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

        {filteredRequests.length === 0 ? (
          <EmptyFilteredState
            actionLabel={t('explorer.reset_filters')}
            description={t('explorer.no_matching_requests')}
            onReset={() => {
              startTransition(() => {
                setSearchValue('');
                setStatusFilter('all');
                setRouteFilter('all');
                setRenderFilter('all');
                setTrafficFilter('all');
                setPage(1);
                setPageSize('10');
              });
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/75">
            <div className="border-border/60 border-b px-4 py-3">
              <PaginationSummary
                currentPage={currentPage}
                filteredCount={filteredRequests.length}
                pageSize={Number(pageSize)}
                t={t}
                totalCount={requests.length}
              />
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
                {pagedRequests.map((request) => (
                  <TableRow
                    key={`${request.time}-${request.path}-${request.deploymentKey ?? 'none'}-${request.statusValue}`}
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
                currentPage={currentPage}
                onNextPage={() => {
                  startTransition(() => {
                    setPage((current) =>
                      Math.min(
                        current + 1,
                        getTotalPages(filteredRequests.length, Number(pageSize))
                      )
                    );
                  });
                }}
                onPreviousPage={() => {
                  startTransition(() => {
                    setPage((current) => Math.max(1, current - 1));
                  });
                }}
                t={t}
                totalItems={filteredRequests.length}
                totalPages={getTotalPages(
                  filteredRequests.length,
                  Number(pageSize)
                )}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
