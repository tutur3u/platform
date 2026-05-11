'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api';
import { useEffect, useMemo, useState } from 'react';
import type {
  HiveNpc,
  HiveSelection,
  HiveTool,
  HiveUser,
  HiveVector3,
  HiveWorldData,
} from '@/engine/types';
import {
  addObject,
  createDefaultWorld,
  removeSelection,
  upsertBlock,
} from '@/engine/world';
import {
  useHiveMutations,
  useHiveRealtimeToken,
  useHiveServers,
  useHiveSnapshot,
} from '@/hooks/use-hive-data';
import { connectHiveRealtime } from '@/realtime/hive-realtime-client';

type UseHiveStudioEngineProps = {
  currentUser: HiveUser;
  initialServers: HiveServersResponse;
  realtimeUrl: string;
};

export function useHiveStudioEngine({
  currentUser,
  initialServers,
  realtimeUrl,
}: UseHiveStudioEngineProps) {
  const [serverId, setServerId] = useState(
    initialServers.servers[0]?.id ?? null
  );
  const serversQuery = useHiveServers(initialServers);
  const snapshotQuery = useHiveSnapshot(serverId, null);
  const mutations = useHiveMutations(serverId);
  const tokenQuery = useHiveRealtimeToken(serverId);
  const [world, setWorld] = useState<HiveWorldData>(createDefaultWorld());
  const [npcs, setNpcs] = useState<HiveNpc[]>([]);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<HiveSelection>(null);
  const [tool, setTool] = useState<HiveTool>('select');
  const [activeTerrain, setActiveTerrain] = useState('grass');
  const [activeObject, setActiveObject] = useState('house');

  useEffect(() => {
    if (!snapshotQuery.data) return;
    setWorld(snapshotQuery.data.world ?? createDefaultWorld());
    setNpcs(snapshotQuery.data.npcs);
    setRevision(snapshotQuery.data.revision);
  }, [snapshotQuery.data]);

  useEffect(() => {
    if (!tokenQuery.data?.token || !serverId) return;
    const client = connectHiveRealtime({
      onMessage: (message) => {
        if (message.type === 'world.event') setRevision(message.event.revision);
      },
      token: tokenQuery.data.token,
      url: tokenQuery.data.url || realtimeUrl,
    });

    client.send({ selection, type: 'presence.join', userId: currentUser.id });

    return () => client.close();
  }, [currentUser.id, realtimeUrl, selection, serverId, tokenQuery.data]);

  const selectedServer = useMemo(
    () => serversQuery.data.servers.find((server) => server.id === serverId),
    [serverId, serversQuery.data.servers]
  );

  const persistWorld = (
    nextWorld: HiveWorldData,
    eventType: string,
    payload: Record<string, unknown> = {}
  ) => {
    if (!serverId) return;
    setWorld(nextWorld);
    mutations.createWorldEvent.mutate({
      eventType,
      expectedRevision: revision,
      payload: { actor: currentUser.id, tool, ...payload },
      world: nextWorld,
    });
  };

  const placeTerrain = (position: HiveVector3) => {
    persistWorld(upsertBlock(world, position, activeTerrain), 'block.place');
  };

  const placeObject = (position: HiveVector3) => {
    persistWorld(addObject(world, position, activeObject), 'object.place');
  };

  const placeNpc = (position: HiveVector3) => {
    if (!serverId) return;
    mutations.createNpc.mutate({
      backstory: 'A new participant in the Hive research settlement.',
      name: `NPC ${npcs.length + 1}`,
      position,
      role: 'settlement observer',
      systemPrompt:
        'Observe nearby voxel entities and decide one grounded action at a time.',
    });
  };

  const eraseSelection = (target: NonNullable<HiveSelection>) => {
    const result = removeSelection(world, npcs, target);
    setSelection(null);

    if (target.kind === 'npc') {
      setNpcs(result.npcs);
      mutations.deleteNpc.mutate(target.id);
      return;
    }

    persistWorld(result.world, `${target.kind}.remove`, {
      erasedId: target.id,
      erasedKind: target.kind,
    });
  };

  const patchNpc = (id: string, patch: Partial<HiveNpc>) => {
    setNpcs((items) =>
      items.map((npc) => (npc.id === id ? { ...npc, ...patch } : npc))
    );
    mutations.updateNpc.mutate({ npcId: id, payload: patch });
  };

  const runNpc = (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced'
  ) => {
    mutations.runNpc.mutate({
      npcId,
      payload: { expectedRevision: revision, promptMode, world },
    });
  };

  const createServer = () => {
    mutations.createServer.mutate({
      description: 'Shared Hive research world',
      enabled: true,
      maxPlayers: 32,
      name: `Hive Lab ${serversQuery.data.servers.length + 1}`,
    });
  };

  return {
    activeObject,
    activeTerrain,
    createServer,
    eraseSelection,
    isRunningNpc: mutations.runNpc.isPending,
    npcs,
    patchNpc,
    placeNpc,
    placeObject,
    placeTerrain,
    revision,
    runNpc,
    selectedServer,
    selection,
    serverId,
    servers: serversQuery.data.servers,
    setActiveObject,
    setActiveTerrain,
    setSelection,
    setServerId,
    setTool,
    tool,
    world,
  };
}
