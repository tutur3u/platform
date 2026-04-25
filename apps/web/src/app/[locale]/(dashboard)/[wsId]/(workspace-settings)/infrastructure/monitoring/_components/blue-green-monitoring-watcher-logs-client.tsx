'use client';

import {
  GitBranch,
  Radio,
  Search,
  SquareStack,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { parseAsInteger, useQueryState } from 'nuqs';
import { startTransition, useDeferredValue, useState } from 'react';
import {
  EmptyFilteredState,
  ExplorerPagination,
  FilterSelect,
  StatusBadge,
  SummaryMetricCard,
} from './blue-green-monitoring-explorer-shared';
import {
  useBlueGreenMonitoringSnapshot,
  useBlueGreenMonitoringWatcherLogArchive,
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
  formatRelativeTime,
  getDeploymentStatusTranslationKey,
} from './formatters';

export function BlueGreenMonitoringWatcherLogsClient() {
  const t = useTranslations('blue-green-monitoring');
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(25).withOptions({ shallow: true })
  );
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState('all');

  const archiveQuery = useBlueGreenMonitoringWatcherLogArchive({
    page,
    pageSize,
  });
  const snapshotQuery = useBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
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
  const filteredLogs = archive.items.filter((log) => {
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
  const scopeOptions = [
    { label: t('logs.scope_all'), value: 'all' },
    ...snapshot.deployments
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
  const levelOptions = [
    { label: t('explorer.all_levels'), value: 'all' },
    ...[...new Set(archive.items.map((log) => log.level))]
      .sort()
      .map((level) => ({
        label: level.toUpperCase(),
        value: level,
      })),
  ];
  const deploymentStatusOptions = [
    { label: t('explorer.all_rollout_statuses'), value: 'all' },
    ...[
      ...new Set(archive.items.map((log) => log.deploymentStatus ?? 'unknown')),
    ]
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
    <section className="space-y-6">
      <BlueGreenMonitoringAlerts snapshot={snapshot} t={t} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          icon={<SquareStack className="h-4 w-4" />}
          label={t('logs_page.cards.retained')}
          meta={t('logs_page.cards.retained_description')}
          value={formatCompactNumber(archive.total)}
        />
        <SummaryMetricCard
          icon={<TriangleAlert className="h-4 w-4" />}
          label={t('explorer.error_entries')}
          meta={t('logs_page.cards.error_description')}
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

      <section className="rounded-lg border border-border/60 bg-background p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.logs')}
            </p>
            <h2 className="mt-1 font-semibold text-xl">
              {t('logs_page.title')}
            </h2>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              {t('logs_page.description')}
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {t('logs_page.badge', {
              current: archive.page,
              total: archive.pageCount,
            })}
          </Badge>
        </div>

        <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-lg border-border/60 pl-10"
                onChange={(event) => {
                  startTransition(() => {
                    setSearchValue(event.target.value);
                  });
                }}
                placeholder={t('explorer.search_logs_placeholder')}
                value={searchValue}
              />
            </div>

            <FilterSelect
              label={t('explorer.scope_filter')}
              onValueChange={setScopeFilter}
              options={scopeOptions}
              value={scopeFilter}
            />

            <FilterSelect
              label={t('explorer.level_filter')}
              onValueChange={setLevelFilter}
              options={levelOptions}
              value={levelFilter}
            />

            <FilterSelect
              label={t('explorer.rollout_status_filter')}
              onValueChange={setDeploymentStatusFilter}
              options={deploymentStatusOptions}
              value={deploymentStatusFilter}
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
            {t('logs_page.page_refinement')}
          </p>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="mt-5">
            <EmptyFilteredState
              actionLabel={t('explorer.reset_filters')}
              description={t('logs_page.empty_filtered')}
              onReset={() => {
                startTransition(() => {
                  setSearchValue('');
                  setScopeFilter('all');
                  setLevelFilter('all');
                  setDeploymentStatusFilter('all');
                });
              }}
            />
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
            <div className="border-border/60 border-b px-4 py-3">
              <p className="font-medium text-sm">
                {t('logs_page.archive_range', {
                  end: Math.min(archive.offset + archive.limit, archive.total),
                  start: archive.total === 0 ? 0 : archive.offset + 1,
                  total: archive.total,
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('logs_page.archive_window', {
                  visible: filteredLogs.length,
                })}
              </p>
            </div>

            <div className="divide-y divide-border/60">
              {filteredLogs.map((log, index) => {
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
    </section>
  );
}
