'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createInfrastructureProject,
  type GetObservabilityParams,
  getBlueGreenMonitoringSnapshot,
  getInfrastructureProjects,
  getObservabilityAnalytics,
  getObservabilityDeployments,
  getObservabilityLogs,
  getObservabilityOverview,
  getObservabilityResources,
  type InfrastructureProject,
  type ObservabilityDeployment,
  type ObservabilityLogsResult,
  type ObservabilityPaginatedResult,
  queueInfrastructureProjectDeploy,
  syncInfrastructureProject,
  type UpdateInfrastructureProjectPayload,
  updateInfrastructureProject,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

type ObservabilityDeploymentsPage =
  ObservabilityPaginatedResult<ObservabilityDeployment>;

export const OBSERVABILITY_QUERY_KEY = [
  'infrastructure',
  'observability',
] as const;

export const INFRASTRUCTURE_PROJECTS_QUERY_KEY = [
  'infrastructure',
  'projects',
] as const;

export function useInfrastructureProjects() {
  return useQuery({
    queryFn: () => getInfrastructureProjects(),
    queryKey: INFRASTRUCTURE_PROJECTS_QUERY_KEY,
    refetchInterval: 30_000,
    staleTime: 5000,
  });
}

export function useBlueGreenWatcherSnapshot(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => getBlueGreenMonitoringSnapshot({ watcherLogLimit: 4 }),
    queryKey: ['infrastructure', 'monitoring', 'blue-green', 'watcher'],
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

export function useObservabilityOverview({
  projectId,
  timeframeHours,
}: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>) {
  return useQuery({
    queryFn: () => getObservabilityOverview({ projectId, timeframeHours }),
    queryKey: [
      ...OBSERVABILITY_QUERY_KEY,
      'overview',
      projectId,
      timeframeHours,
    ],
    refetchInterval: 30_000,
    staleTime: 5000,
  });
}

export function useObservabilityAnalytics({
  enabled,
  projectId,
  timeframeHours,
}: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'> & {
  enabled: boolean;
}) {
  return useQuery({
    enabled,
    queryFn: () => getObservabilityAnalytics({ projectId, timeframeHours }),
    queryKey: [
      ...OBSERVABILITY_QUERY_KEY,
      'analytics',
      projectId,
      timeframeHours,
    ],
    staleTime: 5000,
  });
}

export function useObservabilityLogs({
  enabled,
  filters,
  paused,
}: {
  enabled: boolean;
  filters: GetObservabilityParams;
  paused: boolean;
}) {
  return useInfiniteQuery<
    ObservabilityLogsResult,
    Error,
    InfiniteData<ObservabilityLogsResult>,
    readonly unknown[],
    number
  >({
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getObservabilityLogs({ ...filters, page: pageParam }),
    queryKey: [...OBSERVABILITY_QUERY_KEY, 'logs', filters],
    refetchInterval: paused ? false : 5000,
    staleTime: 1000,
  });
}

export function useObservabilityDeployments({
  enabled,
  filters,
}: {
  enabled: boolean;
  filters: GetObservabilityParams;
}) {
  return useInfiniteQuery<
    ObservabilityDeploymentsPage,
    Error,
    InfiniteData<ObservabilityDeploymentsPage>,
    readonly unknown[],
    number
  >({
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getObservabilityDeployments({ ...filters, page: pageParam }),
    queryKey: [...OBSERVABILITY_QUERY_KEY, 'deployments', filters],
    refetchInterval: (query) => {
      const items = query.state.data?.pages.flatMap((page) => page.items) ?? [];
      return items.some((item) => item.status !== 'successful') ? 2000 : false;
    },
    staleTime: 2000,
  });
}

export function useObservabilityResources({
  enabled,
  projectId,
  timeframeHours,
}: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'> & {
  enabled: boolean;
}) {
  return useQuery({
    enabled,
    queryFn: () => getObservabilityResources({ projectId, timeframeHours }),
    queryKey: [
      ...OBSERVABILITY_QUERY_KEY,
      'resources',
      projectId,
      timeframeHours,
    ],
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

function useInvalidateInfrastructureMonitoring() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: INFRASTRUCTURE_PROJECTS_QUERY_KEY,
    });
    void queryClient.invalidateQueries({ queryKey: OBSERVABILITY_QUERY_KEY });
  };
}

export function useCreateInfrastructureProject() {
  const invalidate = useInvalidateInfrastructureMonitoring();

  return useMutation({
    mutationFn: (payload: Parameters<typeof createInfrastructureProject>[0]) =>
      createInfrastructureProject(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateInfrastructureProject() {
  const invalidate = useInvalidateInfrastructureMonitoring();

  return useMutation({
    mutationFn: ({
      payload,
      project,
    }: {
      payload: UpdateInfrastructureProjectPayload;
      project: InfrastructureProject;
    }) => updateInfrastructureProject(project.id, payload),
    onSuccess: invalidate,
  });
}

export function useSyncInfrastructureProject() {
  const invalidate = useInvalidateInfrastructureMonitoring();

  return useMutation({
    mutationFn: (project: InfrastructureProject) =>
      syncInfrastructureProject(project.id),
    onSuccess: invalidate,
  });
}

export function useQueueInfrastructureProjectDeploy() {
  const invalidate = useInvalidateInfrastructureMonitoring();

  return useMutation({
    mutationFn: (project: InfrastructureProject) =>
      queueInfrastructureProjectDeploy(project.id),
    onSuccess: invalidate,
  });
}
