'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createHiveNpc,
  createHiveServer,
  createHiveWorldEvent,
  getHiveRealtimeToken,
  getHiveSnapshot,
  type HiveNpcPayload,
  type HiveNpcRunPayload,
  type HiveServerPayload,
  type HiveServersResponse,
  type HiveSnapshotResponse,
  type HiveWorldEventPayload,
  listHiveServers,
  runHiveNpcDecision,
  updateHiveNpc,
  updateHiveServer,
} from '@tuturuuu/internal-api';

export const hiveQueryKeys = {
  realtimeToken: (serverId: string) => ['hive', 'realtime-token', serverId],
  servers: ['hive', 'servers'],
  snapshot: (serverId: string) => ['hive', 'snapshot', serverId],
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
  const invalidateServer = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hiveQueryKeys.servers }),
      serverId
        ? queryClient.invalidateQueries({
            queryKey: hiveQueryKeys.snapshot(serverId),
          })
        : Promise.resolve(),
    ]);
  };

  return {
    createNpc: useMutation({
      mutationFn: (payload: HiveNpcPayload) =>
        createHiveNpc(serverId!, payload),
      onSuccess: invalidateServer,
    }),
    createServer: useMutation({
      mutationFn: (payload: HiveServerPayload) => createHiveServer(payload),
      onSuccess: invalidateServer,
    }),
    createWorldEvent: useMutation({
      mutationFn: (payload: HiveWorldEventPayload) =>
        createHiveWorldEvent(serverId!, payload),
      onSuccess: invalidateServer,
    }),
    runNpc: useMutation({
      mutationFn: ({
        npcId,
        payload,
      }: {
        npcId: string;
        payload: HiveNpcRunPayload;
      }) => runHiveNpcDecision(serverId!, npcId, payload),
      onSuccess: invalidateServer,
    }),
    updateNpc: useMutation({
      mutationFn: ({
        npcId,
        payload,
      }: {
        npcId: string;
        payload: Partial<HiveNpcPayload>;
      }) => updateHiveNpc(serverId!, npcId, payload),
      onSuccess: invalidateServer,
    }),
    updateServer: useMutation({
      mutationFn: ({
        payload,
        server,
      }: {
        payload: Partial<HiveServerPayload>;
        server: string;
      }) => updateHiveServer(server, payload),
      onSuccess: invalidateServer,
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
