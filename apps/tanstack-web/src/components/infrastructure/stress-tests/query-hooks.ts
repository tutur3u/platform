'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AbortInfrastructureStressTestPayload,
  abortInfrastructureStressTest,
  getInfrastructureStressTestRun,
  getInfrastructureStressTestSnapshot,
  type InfrastructureStressTestRun,
  type QueueInfrastructureStressTestPayload,
  queueInfrastructureStressTest,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

const STRESS_TEST_QUERY_KEY = [
  'infrastructure',
  'monitoring',
  'stress-tests',
] as const;

function stressTestRunQueryKey(runId: string) {
  return [...STRESS_TEST_QUERY_KEY, 'run', runId] as const;
}

function isLiveRun(run: InfrastructureStressTestRun | null | undefined) {
  return run?.status === 'queued' || run?.status === 'running';
}

export function useInfrastructureStressTestSnapshot() {
  return useQuery({
    queryFn: () => getInfrastructureStressTestSnapshot(),
    queryKey: STRESS_TEST_QUERY_KEY,
    refetchInterval: (query) => (query.state.data?.activeRun ? 1000 : 10000),
    staleTime: 750,
  });
}

export function useInfrastructureStressTestRun({
  enabled,
  initialData,
  runId,
}: {
  enabled: boolean;
  initialData?: InfrastructureStressTestRun;
  runId: string;
}) {
  return useQuery({
    enabled,
    initialData,
    queryFn: () => getInfrastructureStressTestRun(runId),
    queryKey: stressTestRunQueryKey(runId),
    refetchInterval: (query) => (isLiveRun(query.state.data) ? 1000 : false),
    staleTime: 750,
  });
}

export function useQueueInfrastructureStressTest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: QueueInfrastructureStressTestPayload) =>
      queueInfrastructureStressTest(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(
        stressTestRunQueryKey(result.run.id),
        result.run
      );
      queryClient.invalidateQueries({ queryKey: STRESS_TEST_QUERY_KEY });
    },
  });
}

export function useAbortInfrastructureStressTest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      payload,
      runId,
    }: {
      payload?: AbortInfrastructureStressTestPayload;
      runId: string;
    }) => abortInfrastructureStressTest(runId, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(
        stressTestRunQueryKey(result.run.id),
        result.run
      );
      queryClient.invalidateQueries({ queryKey: STRESS_TEST_QUERY_KEY });
    },
  });
}
