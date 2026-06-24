'use client';

import { useSearch } from '@tanstack/react-router';
import { startTransition, useDeferredValue, useMemo, useState } from 'react';
import {
  filterWatcherLogs,
  getDeploymentStatusTranslationKey,
  getWatcherLogKey,
  getWatcherLogLevelOptions,
  getWatcherLogScopeOptions,
  getWatcherLogStatusOptions,
} from './log-utils';
import {
  useBlueGreenMonitoringWatcherLogArchive,
  useBlueGreenMonitoringWatcherSnapshot,
} from './query-hooks';
import type { WatcherLogsTranslations } from './types';

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

export function useWatcherLogExplorer({
  initialPage,
  initialPageSize,
  onPageChange,
  t,
}: {
  initialPage: number;
  initialPageSize: number;
  onPageChange?: (page: number) => void;
  t: WatcherLogsTranslations;
}) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const [page, setPageState] = useState(() =>
    readNumberSearchValue(search, 'page', initialPage)
  );
  const [pageSize, setPageSize] = useState(() =>
    readNumberSearchValue(search, 'pageSize', initialPageSize)
  );
  const [searchValue, setSearchValue] = useState(
    typeof search.q === 'string' ? search.q : ''
  );
  const deferredSearchValue = useDeferredValue(searchValue);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState('all');
  const [selectedLogKey, setSelectedLogKey] = useState<string | null>(null);

  const archiveQuery = useBlueGreenMonitoringWatcherLogArchive({
    page,
    pageSize,
  });
  const snapshotQuery = useBlueGreenMonitoringWatcherSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
  });

  const archive = archiveQuery.data;
  const snapshot = snapshotQuery.data;
  const archiveLogs = archive?.items ?? [];
  const filteredLogs = useMemo(
    () =>
      filterWatcherLogs(archiveLogs, {
        deploymentStatus: deploymentStatusFilter,
        level: levelFilter,
        query: deferredSearchValue,
        scope: scopeFilter,
      }),
    [
      archiveLogs,
      deferredSearchValue,
      deploymentStatusFilter,
      levelFilter,
      scopeFilter,
    ]
  );
  const scopeOptions = useMemo(
    () =>
      getWatcherLogScopeOptions(
        archiveLogs,
        t('logs.scope_all'),
        t('states.none')
      ),
    [archiveLogs, t]
  );
  const levelOptions = useMemo(
    () => getWatcherLogLevelOptions(archiveLogs, t('explorer.all_levels')),
    [archiveLogs, t]
  );
  const deploymentStatusOptions = useMemo(
    () =>
      getWatcherLogStatusOptions({
        allLabel: t('explorer.all_rollout_statuses'),
        logs: archiveLogs,
        translateStatus: (status) =>
          t(getDeploymentStatusTranslationKey(status)),
      }),
    [archiveLogs, t]
  );
  const selectedLog =
    filteredLogs.find(
      (log, index) => getWatcherLogKey(log, index) === selectedLogKey
    ) ??
    filteredLogs[0] ??
    null;
  const activeSelectedLogKey = selectedLog
    ? getWatcherLogKey(selectedLog, filteredLogs.indexOf(selectedLog))
    : null;
  const errorLogCount = filteredLogs.filter(
    (log) => log.level === 'error'
  ).length;
  const warningLogCount = filteredLogs.filter((log) =>
    ['warn', 'warning'].includes(log.level)
  ).length;
  const failedRolloutCount = filteredLogs.filter(
    (log) => log.deploymentStatus === 'failed'
  ).length;

  function setPage(nextPage: number) {
    setPageState(nextPage);
    onPageChange?.(nextPage);
    setSelectedLogKey(null);
  }

  function resetFilters() {
    startTransition(() => {
      setSearchValue('');
      setScopeFilter('all');
      setLevelFilter('all');
      setDeploymentStatusFilter('all');
      setSelectedLogKey(null);
    });
  }

  function updateSearchValue(value: string) {
    startTransition(() => {
      setSearchValue(value);
      setSelectedLogKey(null);
    });
  }

  function updateScopeFilter(value: string) {
    startTransition(() => {
      setScopeFilter(value);
      setSelectedLogKey(null);
    });
  }

  function updateLevelFilter(value: string) {
    startTransition(() => {
      setLevelFilter(value);
      setSelectedLogKey(null);
    });
  }

  function updateDeploymentStatusFilter(value: string) {
    startTransition(() => {
      setDeploymentStatusFilter(value);
      setSelectedLogKey(null);
    });
  }

  function updatePageSize(value: number) {
    startTransition(() => {
      setPageSize(value);
      setPage(1);
    });
  }

  function goToNextPage() {
    if (archive?.hasNextPage) {
      setPage(archive.page + 1);
    }
  }

  function goToPreviousPage() {
    if (archive?.hasPreviousPage) {
      setPage(Math.max(1, archive.page - 1));
    }
  }

  return {
    activeSelectedLogKey,
    archive,
    archiveQuery,
    deploymentStatusFilter,
    deploymentStatusOptions,
    errorLogCount,
    failedRolloutCount,
    filteredLogs,
    goToNextPage,
    goToPreviousPage,
    levelFilter,
    levelOptions,
    pageSize,
    resetFilters,
    scopeFilter,
    scopeOptions,
    searchValue,
    selectedLog,
    setSelectedLogKey,
    snapshot,
    snapshotQuery,
    updateDeploymentStatusFilter,
    updateLevelFilter,
    updatePageSize,
    updateScopeFilter,
    updateSearchValue,
    warningLogCount,
  };
}
