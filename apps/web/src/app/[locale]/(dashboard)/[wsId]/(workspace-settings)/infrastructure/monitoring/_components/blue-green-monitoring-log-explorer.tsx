'use client';

import {
  GitBranch,
  Radio,
  Search,
  SquareStack,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  BlueGreenMonitoringDeployment,
  BlueGreenMonitoringWatcherLog,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { startTransition, useDeferredValue, useState } from 'react';
import {
  EmptyFilteredState,
  ExplorerPagination,
  FilterSelect,
  getSafePage,
  getTotalPages,
  PAGE_SIZE_OPTIONS,
  PaginationSummary,
  paginateItems,
  StatusBadge,
  SummaryMetricCard,
} from './blue-green-monitoring-explorer-shared';
import {
  formatClockTime,
  formatCompactNumber,
  formatDateTime,
  formatRelativeTime,
  getDeploymentStatusTranslationKey,
} from './formatters';

export function WatcherLogsPanel({
  deployments,
  logs,
}: {
  deployments: BlueGreenMonitoringDeployment[];
  logs: BlueGreenMonitoringWatcherLog[];
}) {
  const t = useTranslations('blue-green-monitoring');
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState('all');
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>('10');
  const [page, setPage] = useState(1);

  const scopeOptions = [
    { label: t('logs.scope_all'), value: 'all' },
    ...deployments
      .map((deployment) => {
        const scopeValue =
          deployment.deploymentStamp != null
            ? `stamp:${deployment.deploymentStamp}`
            : deployment.commitHash != null
              ? `commit:${deployment.commitHash}`
              : null;

        if (!scopeValue) {
          return null;
        }

        return {
          label:
            deployment.commitShortHash ??
            deployment.deploymentStamp ??
            deployment.activeColor ??
            t('states.none'),
          value: scopeValue,
        };
      })
      .filter(
        (scope, index, scopes): scope is { label: string; value: string } =>
          scope != null &&
          scopes.findIndex((candidate) => candidate?.value === scope.value) ===
            index
      ),
  ];
  const filteredLogs = logs.filter((log) => {
    if (scopeFilter !== 'all' && log.deploymentKey !== scopeFilter) {
      return false;
    }

    if (levelFilter !== 'all' && log.level !== levelFilter) {
      return false;
    }

    if (
      deploymentStatusFilter !== 'all' &&
      (log.deploymentStatus ?? 'unknown') !== deploymentStatusFilter
    ) {
      return false;
    }

    const query = deferredSearchValue.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const searchFields = [
      log.message,
      log.level,
      log.commitShortHash,
      log.commitHash,
      log.deploymentStamp,
      log.deploymentKind,
      log.deploymentStatus,
      log.activeColor,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return searchFields.some((value) => value.includes(query));
  });
  const currentPage = getSafePage(page, filteredLogs.length, Number(pageSize));
  const pagedLogs = paginateItems(filteredLogs, currentPage, Number(pageSize));
  const levelOptions = [
    { label: t('explorer.all_levels'), value: 'all' },
    ...[...new Set(logs.map((log) => log.level))].sort().map((level) => ({
      label: level.toUpperCase(),
      value: level,
    })),
  ];
  const deploymentStatusOptions = [
    { label: t('explorer.all_rollout_statuses'), value: 'all' },
    ...[...new Set(logs.map((log) => log.deploymentStatus ?? 'unknown'))]
      .sort()
      .map((status) => ({
        label: t(getDeploymentStatusTranslationKey(status)),
        value: status,
      })),
  ];
  const errorLogCount = filteredLogs.filter(
    (log) => log.level === 'error'
  ).length;
  const warningLogCount = filteredLogs.filter(
    (log) => log.level === 'warn'
  ).length;
  const failedRolloutCount = filteredLogs.filter(
    (log) => log.deploymentStatus === 'failed'
  ).length;

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-background p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.logs')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('panels.latest_logs')}
            </h3>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              {t('explorer.logs_description')}
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {filteredLogs.length} / {logs.length} {t('logs.entries')}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            icon={<SquareStack className="h-4 w-4" />}
            label={t('explorer.filtered_entries')}
            meta={t('explorer.pagination_status', {
              current: pagedLogs.length === 0 ? 0 : pagedLogs.length,
              total: filteredLogs.length,
            })}
            value={formatCompactNumber(filteredLogs.length)}
          />
          <SummaryMetricCard
            icon={<TriangleAlert className="h-4 w-4" />}
            label={t('explorer.error_entries')}
            meta={t('explorer.error_hint')}
            value={formatCompactNumber(errorLogCount)}
          />
          <SummaryMetricCard
            icon={<Radio className="h-4 w-4" />}
            label={t('explorer.warning_entries')}
            meta={t('explorer.warning_hint')}
            value={formatCompactNumber(warningLogCount)}
          />
          <SummaryMetricCard
            icon={<GitBranch className="h-4 w-4" />}
            label={t('explorer.failed_rollouts')}
            meta={t('explorer.failed_rollouts_hint')}
            value={formatCompactNumber(failedRolloutCount)}
          />
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-lg border-border/60 pl-10"
                onChange={(event) => {
                  startTransition(() => {
                    setSearchValue(event.target.value);
                    setPage(1);
                  });
                }}
                placeholder={t('explorer.search_logs_placeholder')}
                value={searchValue}
              />
            </div>

            <FilterSelect
              label={t('explorer.scope_filter')}
              onValueChange={(value) => {
                startTransition(() => {
                  setScopeFilter(value);
                  setPage(1);
                });
              }}
              options={scopeOptions}
              value={scopeFilter}
            />

            <FilterSelect
              label={t('explorer.level_filter')}
              onValueChange={(value) => {
                startTransition(() => {
                  setLevelFilter(value);
                  setPage(1);
                });
              }}
              options={levelOptions}
              value={levelFilter}
            />

            <FilterSelect
              label={t('explorer.rollout_status_filter')}
              onValueChange={(value) => {
                startTransition(() => {
                  setDeploymentStatusFilter(value);
                  setPage(1);
                });
              }}
              options={deploymentStatusOptions}
              value={deploymentStatusFilter}
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

        {filteredLogs.length === 0 ? (
          <EmptyFilteredState
            actionLabel={t('explorer.reset_filters')}
            description={t('explorer.no_matching_logs')}
            onReset={() => {
              startTransition(() => {
                setSearchValue('');
                setScopeFilter('all');
                setLevelFilter('all');
                setDeploymentStatusFilter('all');
                setPage(1);
                setPageSize('10');
              });
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/20">
            <div className="border-border/60 border-b px-4 py-3">
              <PaginationSummary
                currentPage={currentPage}
                filteredCount={filteredLogs.length}
                pageSize={Number(pageSize)}
                t={t}
                totalCount={logs.length}
              />
            </div>

            <div className="divide-y divide-border/60">
              {pagedLogs.map((log, index) => {
                const deploymentLabel =
                  log.commitShortHash ??
                  log.deploymentStamp ??
                  log.activeColor ??
                  t('states.none');

                return (
                  <div
                    key={`${log.time}-${log.message}-${index}`}
                    className="space-y-4 px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            tone={
                              log.level === 'error'
                                ? 'destructive'
                                : log.level === 'warn'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {log.level.toUpperCase()}
                          </StatusBadge>
                          <Badge variant="outline" className="rounded-full">
                            {deploymentLabel}
                          </Badge>
                          {log.deploymentStatus ? (
                            <Badge variant="outline" className="rounded-full">
                              {t(
                                getDeploymentStatusTranslationKey(
                                  log.deploymentStatus
                                )
                              )}
                            </Badge>
                          ) : null}
                          {log.deploymentKind ? (
                            <Badge variant="secondary" className="rounded-full">
                              {log.deploymentKind}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="whitespace-pre-wrap font-mono text-sm leading-6">
                          {log.message}
                        </p>

                        <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
                          <span>{log.commitHash ?? t('states.none')}</span>
                          <span>{log.activeColor ?? t('states.none')}</span>
                          <span>{formatDateTime(log.time)}</span>
                        </div>
                      </div>

                      <div className="shrink-0 space-y-2 text-right text-sm">
                        <div className="font-medium">
                          {formatClockTime(log.time)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatRelativeTime(log.time)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-border/60 border-t px-4 py-3">
              <ExplorerPagination
                currentPage={currentPage}
                onNextPage={() => {
                  startTransition(() => {
                    setPage((current) =>
                      Math.min(
                        current + 1,
                        getTotalPages(filteredLogs.length, Number(pageSize))
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
                totalItems={filteredLogs.length}
                totalPages={getTotalPages(
                  filteredLogs.length,
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
