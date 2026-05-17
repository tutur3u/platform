'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveHiveWorkflow,
  createHiveNpc,
  createHiveServer,
  createHiveWorkflow,
  createHiveWorldEvent,
  deleteHiveNpc,
  deleteHiveServer,
  getHiveRealtimeToken,
  getHiveSnapshot,
  type HiveNpcPayload,
  type HiveNpcRunPayload,
  type HiveServerPayload,
  type HiveServerSettings,
  type HiveServersResponse,
  type HiveSnapshotResponse,
  type HiveWorkflowPayload,
  type HiveWorkflowRunPayload,
  type HiveWorldEventPayload,
  listHiveServers,
  listHiveWorkflowRuns,
  listHiveWorkflows,
  runHiveNpcDecision,
  runHiveSimulationTick,
  runHiveWorkflow,
  updateHiveNpc,
  updateHiveServer,
  updateHiveServerSettings,
  updateHiveWorkflow,
} from '@tuturuuu/internal-api/hive';

export const hiveQueryKeys = {
  realtimeToken: (serverId: string) => ['hive', 'realtime-token', serverId],
  servers: ['hive', 'servers'],
  snapshot: (serverId: string) => ['hive', 'snapshot', serverId],
  workflowRuns: (serverId: string, workflowId: string) => [
    'hive',
    'workflow-runs',
    serverId,
    workflowId,
  ],
  workflows: (serverId: string) => ['hive', 'workflows', serverId],
};

export function useHiveServers(initialData: HiveServersResponse) {
  return useQuery({
    initialData,
    queryFn: () => listHiveServers(),
    queryKey: hiveQueryKeys.servers,
  });
}

export function useHiveSnapshot(
  serverId: string | null,
  initialData: HiveSnapshotResponse | null
) {
  return useQuery({
    enabled: !!serverId,
    initialData: initialData ?? undefined,
    queryFn: () => getHiveSnapshot(serverId!),
    queryKey: serverId
      ? hiveQueryKeys.snapshot(serverId)
      : ['hive', 'snapshot'],
  });
}

export function useHiveMutations(serverId: string | null) {
  const queryClient = useQueryClient();
  const invalidateServers = async () => {
    await queryClient.invalidateQueries({ queryKey: hiveQueryKeys.servers });
  };
  const invalidateServer = async (targetServerId = serverId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hiveQueryKeys.servers }),
      targetServerId
        ? queryClient.invalidateQueries({
            queryKey: hiveQueryKeys.snapshot(targetServerId),
          })
        : Promise.resolve(),
    ]);
  };

  return {
    createNpc: useMutation({
      mutationFn: (payload: HiveNpcPayload) =>
        createHiveNpc(serverId!, payload),
      onSuccess: () => invalidateServer(),
    }),
    createServer: useMutation({
      mutationFn: (payload: HiveServerPayload) => createHiveServer(payload),
      onSuccess: () => invalidateServer(),
    }),
    createWorldEvent: useMutation({
      mutationFn: (payload: HiveWorldEventPayload) =>
        createHiveWorldEvent(serverId!, payload),
      onSuccess: (data, variables) => {
        if (!serverId) return;
        queryClient.setQueryData<HiveSnapshotResponse>(
          hiveQueryKeys.snapshot(serverId),
          (snapshot) =>
            snapshot
              ? {
                  ...snapshot,
                  events: [data.event, ...snapshot.events].slice(0, 100),
                  revision: data.revision,
                  world: variables.world,
                }
              : snapshot
        );
        queryClient.setQueryData<HiveServersResponse>(
          hiveQueryKeys.servers,
          (servers) => (servers ? { ...servers } : servers)
        );
      },
    }),
    deleteServer: useMutation({
      mutationFn: (targetServerId: string) => deleteHiveServer(targetServerId),
      onSuccess: async (_data, targetServerId) => {
        queryClient.removeQueries({
          queryKey: hiveQueryKeys.snapshot(targetServerId),
        });
        await invalidateServers();
      },
    }),
    deleteNpc: useMutation({
      mutationFn: (npcId: string) => deleteHiveNpc(serverId!, npcId),
      onSuccess: () => invalidateServer(),
    }),
    runNpc: useMutation({
      mutationFn: ({
        npcId,
        payload,
      }: {
        npcId: string;
        payload: HiveNpcRunPayload;
      }) => runHiveNpcDecision(serverId!, npcId, payload),
      onSuccess: () => invalidateServer(),
    }),
    runSimulationTick: useMutation({
      mutationFn: () => runHiveSimulationTick(serverId!),
      onSuccess: () => invalidateServer(),
    }),
    updateNpc: useMutation({
      mutationFn: ({
        npcId,
        payload,
      }: {
        npcId: string;
        payload: Partial<HiveNpcPayload>;
      }) => updateHiveNpc(serverId!, npcId, payload),
      onSuccess: () => invalidateServer(),
    }),
    updateServer: useMutation({
      mutationFn: ({
        payload,
        server,
      }: {
        payload: Partial<HiveServerPayload>;
        server: string;
      }) => updateHiveServer(server, payload),
      onSuccess: () => invalidateServer(),
    }),
    updateServerSettings: useMutation({
      mutationFn: (payload: HiveServerSettings) =>
        updateHiveServerSettings(serverId!, payload),
      onSuccess: () => invalidateServer(),
    }),
  };
}

export function useHiveRealtimeToken(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryFn: () => getHiveRealtimeToken(serverId!),
    queryKey: serverId
      ? hiveQueryKeys.realtimeToken(serverId)
      : ['hive', 'realtime-token'],
    staleTime: 9 * 60 * 1000,
  });
}

export function useHiveWorkflows(serverId: string | null, enabled: boolean) {
  return useQuery({
    enabled: !!serverId && enabled,
    queryFn: () => listHiveWorkflows(serverId!),
    queryKey: serverId
      ? hiveQueryKeys.workflows(serverId)
      : ['hive', 'workflows'],
  });
}

export function useHiveWorkflowRuns(
  serverId: string | null,
  workflowId: string | null,
  enabled: boolean
) {
  return useQuery({
    enabled: !!serverId && !!workflowId && enabled,
    queryFn: () => listHiveWorkflowRuns(serverId!, workflowId!),
    queryKey:
      serverId && workflowId
        ? hiveQueryKeys.workflowRuns(serverId, workflowId)
        : ['hive', 'workflow-runs'],
  });
}

export function useHiveWorkflowMutations(
  serverId: string | null,
  workflowId: string | null
) {
  const queryClient = useQueryClient();
  const invalidateWorkflows = async () => {
    if (!serverId) return;
    await queryClient.invalidateQueries({
      queryKey: hiveQueryKeys.workflows(serverId),
    });
  };
  const invalidateRuns = async () => {
    if (!serverId || !workflowId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hiveQueryKeys.servers }),
      queryClient.invalidateQueries({
        queryKey: hiveQueryKeys.workflowRuns(serverId, workflowId),
      }),
      queryClient.invalidateQueries({
        queryKey: hiveQueryKeys.snapshot(serverId),
      }),
    ]);
  };

  return {
    archiveWorkflow: useMutation({
      mutationFn: (targetWorkflowId: string) =>
        archiveHiveWorkflow(serverId!, targetWorkflowId),
      onSuccess: invalidateWorkflows,
    }),
    createWorkflow: useMutation({
      mutationFn: (payload: HiveWorkflowPayload) =>
        createHiveWorkflow(serverId!, payload),
      onSuccess: invalidateWorkflows,
    }),
    runWorkflow: useMutation({
      mutationFn: (payload: HiveWorkflowRunPayload) =>
        runHiveWorkflow(serverId!, workflowId!, payload),
      onSuccess: invalidateRuns,
    }),
    updateWorkflow: useMutation({
      mutationFn: ({
        payload,
        targetWorkflowId,
      }: {
        payload: Partial<HiveWorkflowPayload>;
        targetWorkflowId: string;
      }) => updateHiveWorkflow(serverId!, targetWorkflowId, payload),
      onSuccess: invalidateWorkflows,
    }),
  };
}
