'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getBlueGreenMonitoringRequestArchive,
  getBlueGreenMonitoringSnapshot,
  getBlueGreenMonitoringWatcherLogArchive,
} from '@tuturuuu/internal-api/infrastructure';

export function useBlueGreenMonitoringSnapshot({
  requestPreviewLimit,
  watcherLogLimit,
}: {
  requestPreviewLimit?: number;
  watcherLogLimit?: number;
} = {}) {
  return useQuery({
    queryKey: [
      'infrastructure',
      'monitoring',
      'blue-green',
      'snapshot',
      requestPreviewLimit ?? null,
      watcherLogLimit ?? null,
    ],
    queryFn: () =>
      getBlueGreenMonitoringSnapshot({
        requestPreviewLimit,
        watcherLogLimit,
      }),
    refetchInterval: (query) =>
      query.state.data?.watcher.health === 'live' ? 5000 : 15000,
    staleTime: 2000,
  });
}

export function useBlueGreenMonitoringRequestArchive({
  page,
  pageSize,
  timeframeDays,
}: {
  page: number;
  pageSize: number;
  timeframeDays: number;
}) {
  return useQuery({
    queryKey: [
      'infrastructure',
      'monitoring',
      'blue-green',
      'requests',
      page,
      pageSize,
      timeframeDays,
    ],
    queryFn: () =>
      getBlueGreenMonitoringRequestArchive({
        page,
        pageSize,
        timeframeDays,
      }),
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

export function useBlueGreenMonitoringWatcherLogArchive({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: [
      'infrastructure',
      'monitoring',
      'blue-green',
      'watcher-logs',
      page,
      pageSize,
    ],
    queryFn: () =>
      getBlueGreenMonitoringWatcherLogArchive({
        page,
        pageSize,
      }),
    refetchInterval: 15000,
    staleTime: 5000,
  });
}
