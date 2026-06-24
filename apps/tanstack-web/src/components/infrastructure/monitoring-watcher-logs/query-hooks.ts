'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type GetBlueGreenMonitoringArchiveParams,
  type GetBlueGreenMonitoringSnapshotParams,
  getBlueGreenMonitoringSnapshot,
  getBlueGreenMonitoringWatcherLogArchive,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

export const WATCHER_LOGS_QUERY_KEY = [
  'infrastructure',
  'monitoring',
  'blue-green',
  'watcher-logs',
] as const;

export const WATCHER_SNAPSHOT_QUERY_KEY = [
  'infrastructure',
  'monitoring',
  'blue-green',
  'watcher',
] as const;

export function watcherLogsArchiveQueryKey(
  params: GetBlueGreenMonitoringArchiveParams | undefined
) {
  return [...WATCHER_LOGS_QUERY_KEY, params ?? {}] as const;
}

export function watcherSnapshotQueryKey(
  params: GetBlueGreenMonitoringSnapshotParams | undefined
) {
  return [...WATCHER_SNAPSHOT_QUERY_KEY, params ?? {}] as const;
}

export function useBlueGreenMonitoringWatcherLogArchive(
  params?: GetBlueGreenMonitoringArchiveParams
) {
  return useQuery({
    queryFn: () => getBlueGreenMonitoringWatcherLogArchive(params),
    queryKey: watcherLogsArchiveQueryKey(params),
    refetchInterval: 15_000,
    staleTime: 5000,
  });
}

export function useBlueGreenMonitoringWatcherSnapshot(
  params?: GetBlueGreenMonitoringSnapshotParams
) {
  return useQuery({
    queryFn: () => getBlueGreenMonitoringSnapshot(params),
    queryKey: watcherSnapshotQueryKey(params),
    refetchInterval: (query) =>
      query.state.data?.watcher.health === 'live' ? 5000 : 15_000,
    staleTime: 5000,
  });
}
