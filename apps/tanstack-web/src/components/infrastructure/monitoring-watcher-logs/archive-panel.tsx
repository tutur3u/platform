'use client';

import type {
  BlueGreenMonitoringPaginatedResult,
  BlueGreenMonitoringWatcherLog,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import {
  ArchivePagination,
  EmptyArchiveState,
} from '../monitoring-requests/archive-primitives';
import { WatcherLogDetail } from './log-detail';
import { WatcherLogList } from './log-list';
import { getWatcherLogKey } from './log-utils';
import type { WatcherLogsTranslations } from './types';

export function WatcherLogArchivePanel({
  archive,
  onNextPage,
  onPreviousPage,
  onResetFilters,
  onSelectLogKey,
  selectedLog,
  selectedLogKey,
  t,
  visibleLogs,
}: {
  archive: BlueGreenMonitoringPaginatedResult<BlueGreenMonitoringWatcherLog>;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onResetFilters: () => void;
  onSelectLogKey: (key: string) => void;
  selectedLog: BlueGreenMonitoringWatcherLog | null;
  selectedLogKey: string | null;
  t: WatcherLogsTranslations;
  visibleLogs: BlueGreenMonitoringWatcherLog[];
}) {
  if (visibleLogs.length === 0) {
    return (
      <EmptyArchiveState
        actionLabel={t('explorer.reset_filters')}
        description={t('logs_page.empty_filtered')}
        onReset={onResetFilters}
      />
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
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
              visible: visibleLogs.length,
            })}
          </p>
        </div>

        <WatcherLogList
          logs={visibleLogs}
          onSelect={(log) => {
            const selectedIndex = visibleLogs.indexOf(log);
            onSelectLogKey(getWatcherLogKey(log, selectedIndex));
          }}
          selectedLogKey={selectedLogKey}
          t={t}
        />

        <div className="border-border/60 border-t px-4 py-3">
          <ArchivePagination
            currentPage={archive.page}
            hasNextPage={archive.hasNextPage}
            hasPreviousPage={archive.hasPreviousPage}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
            t={t}
            totalItems={archive.total}
            totalPages={archive.pageCount}
          />
        </div>
      </div>

      <WatcherLogDetail log={selectedLog} t={t} />
    </div>
  );
}
