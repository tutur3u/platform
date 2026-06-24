'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'use-intl';
import { WatcherLogArchivePanel } from './archive-panel';
import { WatcherLogFilters } from './filters';
import { WatcherLogMetrics } from './metrics';
import { WatcherLogsErrorState, WatcherLogsLoadingState } from './state';
import { WatcherSnapshotSummary } from './summary';
import { useWatcherLogExplorer } from './use-watcher-log-explorer';

export function MonitoringWatcherLogsClient({
  initialPage = 1,
  initialPageSize = 25,
  onPageChange,
}: {
  initialPage?: number;
  initialPageSize?: number;
  onPageChange?: (page: number) => void;
}) {
  const t = useTranslations('blue-green-monitoring');
  const explorer = useWatcherLogExplorer({
    initialPage,
    initialPageSize,
    onPageChange,
    t,
  });

  if (explorer.archiveQuery.isPending || explorer.snapshotQuery.isPending) {
    return <WatcherLogsLoadingState />;
  }

  if (
    explorer.archiveQuery.isError ||
    !explorer.archive ||
    explorer.snapshotQuery.isError ||
    !explorer.snapshot
  ) {
    return (
      <WatcherLogsErrorState
        onRetry={() => {
          void explorer.archiveQuery.refetch();
          void explorer.snapshotQuery.refetch();
        }}
        t={t}
      />
    );
  }

  return (
    <section className="space-y-6">
      <WatcherSnapshotSummary snapshot={explorer.snapshot} t={t} />

      <WatcherLogMetrics
        errorLogCount={explorer.errorLogCount}
        failedRolloutCount={explorer.failedRolloutCount}
        retainedLogCount={explorer.archive.total}
        t={t}
        warningLogCount={explorer.warningLogCount}
      />

      <section className="space-y-5 rounded-lg border border-border/60 bg-background p-5">
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
          <Badge className="rounded-full" variant="secondary">
            {t('logs_page.badge', {
              current: explorer.archive.page,
              total: explorer.archive.pageCount,
            })}
          </Badge>
        </div>

        <WatcherLogFilters
          deploymentStatusFilter={explorer.deploymentStatusFilter}
          deploymentStatusOptions={explorer.deploymentStatusOptions}
          levelFilter={explorer.levelFilter}
          levelOptions={explorer.levelOptions}
          onDeploymentStatusFilterChange={explorer.updateDeploymentStatusFilter}
          onLevelFilterChange={explorer.updateLevelFilter}
          onPageSizeChange={explorer.updatePageSize}
          onScopeFilterChange={explorer.updateScopeFilter}
          onSearchValueChange={explorer.updateSearchValue}
          pageSize={explorer.pageSize}
          scopeFilter={explorer.scopeFilter}
          scopeOptions={explorer.scopeOptions}
          searchValue={explorer.searchValue}
          t={t}
        />

        <WatcherLogArchivePanel
          archive={explorer.archive}
          onNextPage={explorer.goToNextPage}
          onPreviousPage={explorer.goToPreviousPage}
          onResetFilters={explorer.resetFilters}
          onSelectLogKey={explorer.setSelectedLogKey}
          selectedLog={explorer.selectedLog}
          selectedLogKey={explorer.activeSelectedLogKey}
          t={t}
          visibleLogs={explorer.filteredLogs}
        />
      </section>
    </section>
  );
}
