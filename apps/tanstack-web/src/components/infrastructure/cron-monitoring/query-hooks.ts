'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type GetCronMonitoringExecutionArchiveParams,
  getCronMonitoringExecutionArchive,
  getCronMonitoringSnapshot,
  type QueueCronRunPayload,
  queueCronRun,
  type UpdateCronMonitoringControlPayload,
  updateCronMonitoringControl,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

export const CRON_MONITORING_QUERY_KEY = [
  'infrastructure',
  'monitoring',
  'cron',
] as const;

function cronMonitoringExecutionArchiveQueryKey(
  params: GetCronMonitoringExecutionArchiveParams | undefined
) {
  return [...CRON_MONITORING_QUERY_KEY, 'executions', params ?? {}] as const;
}

export function useCronMonitoringSnapshot() {
  return useQuery({
    queryFn: () => getCronMonitoringSnapshot(),
    queryKey: CRON_MONITORING_QUERY_KEY,
    refetchInterval: (query) =>
      query.state.data?.runs.some(
        (run) => run.status === 'queued' || run.status === 'processing'
      )
        ? 1000
        : 10_000,
    staleTime: 750,
  });
}

export function useCronMonitoringExecutionArchive(
  params?: GetCronMonitoringExecutionArchiveParams
) {
  return useQuery({
    queryFn: () => getCronMonitoringExecutionArchive(params),
    queryKey: cronMonitoringExecutionArchiveQueryKey(params),
    staleTime: 750,
  });
}

export function useQueueCronRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: QueueCronRunPayload) => queueCronRun(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CRON_MONITORING_QUERY_KEY });
    },
  });
}

export function useUpdateCronMonitoringControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCronMonitoringControlPayload) =>
      updateCronMonitoringControl(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CRON_MONITORING_QUERY_KEY });
    },
  });
}
