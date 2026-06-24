'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type GetBlueGreenMonitoringRequestArchiveParams,
  getBlueGreenMonitoringRequestArchive,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

export const MONITORING_REQUESTS_QUERY_KEY = [
  'infrastructure',
  'monitoring',
  'blue-green',
  'requests',
] as const;

export function monitoringRequestsArchiveQueryKey(
  params: GetBlueGreenMonitoringRequestArchiveParams | undefined
) {
  return [...MONITORING_REQUESTS_QUERY_KEY, params ?? {}] as const;
}

export function useBlueGreenMonitoringRequestArchive(
  params?: GetBlueGreenMonitoringRequestArchiveParams
) {
  return useQuery({
    queryFn: () => getBlueGreenMonitoringRequestArchive(params),
    queryKey: monitoringRequestsArchiveQueryKey(params),
    refetchInterval: 15_000,
    staleTime: 5000,
  });
}
