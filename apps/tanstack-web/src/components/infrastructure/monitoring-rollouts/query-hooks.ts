'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearBlueGreenDeploymentPin,
  type GetBlueGreenMonitoringSnapshotParams,
  getBlueGreenMonitoringSnapshot,
  pinBlueGreenDeployment,
  requestBlueGreenInstantRollout,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

export const MONITORING_ROLLOUTS_QUERY_KEY = [
  'infrastructure',
  'monitoring',
  'blue-green',
] as const;

export function monitoringRolloutsSnapshotQueryKey(
  params: GetBlueGreenMonitoringSnapshotParams | undefined
) {
  return [...MONITORING_ROLLOUTS_QUERY_KEY, params ?? {}] as const;
}

export function useBlueGreenMonitoringRolloutsSnapshot(
  params?: GetBlueGreenMonitoringSnapshotParams
) {
  return useQuery({
    queryFn: () => getBlueGreenMonitoringSnapshot(params),
    queryKey: monitoringRolloutsSnapshotQueryKey(params),
    refetchInterval: (query) =>
      query.state.data?.watcher.health === 'live' ? 5000 : 15_000,
    staleTime: 5000,
  });
}

function useInvalidateRolloutsSnapshot() {
  const queryClient = useQueryClient();

  return () =>
    queryClient.invalidateQueries({
      queryKey: MONITORING_ROLLOUTS_QUERY_KEY,
    });
}

export function useRequestInstantRollout() {
  const invalidateSnapshot = useInvalidateRolloutsSnapshot();

  return useMutation({
    mutationFn: () => requestBlueGreenInstantRollout(),
    onSuccess: invalidateSnapshot,
  });
}

export function usePinBlueGreenDeployment() {
  const invalidateSnapshot = useInvalidateRolloutsSnapshot();

  return useMutation({
    mutationFn: (commitHash: string) => pinBlueGreenDeployment({ commitHash }),
    onSuccess: invalidateSnapshot,
  });
}

export function useClearBlueGreenDeploymentPin() {
  const invalidateSnapshot = useInvalidateRolloutsSnapshot();

  return useMutation({
    mutationFn: () => clearBlueGreenDeploymentPin(),
    onSuccess: invalidateSnapshot,
  });
}
