'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { objectCatalog, terrainCatalog } from '@/engine/catalog';
import type {
  HiveNpc,
  HiveSelection,
  HiveServer,
  HiveTool,
  HiveUser,
  HiveVector3,
  HiveWorldData,
} from '@/engine/types';
import {
  addObject,
  createDefaultWorld,
  createEmptyWorld,
  moveObject,
  removeSelection,
  rotateObject,
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
  const revisionRef = useRef(0);
  const rotateSelectionRef = useRef<() => void>(() => undefined);
  const [selection, setSelection] = useState<HiveSelection>(null);
  const [tool, setTool] = useState<HiveTool>('select');
  const [activeTerrain, setActiveTerrain] = useState('grass');
  const [activeObject, setActiveObject] = useState('house');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    if (!snapshotQuery.data) return;
    setWorld(snapshotQuery.data.world ?? createDefaultWorld());
    setNpcs(snapshotQuery.data.npcs);
    setRevision(snapshotQuery.data.revision);
    revisionRef.current = snapshotQuery.data.revision;
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

    client.send({
      selection: null,
      type: 'presence.join',
      userId: currentUser.id,
    });

    return () => client.close();
  }, [currentUser.id, realtimeUrl, serverId, tokenQuery.data]);

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
    const expectedRevision = revisionRef.current;
    setWorld(nextWorld);
    mutations.createWorldEvent.mutate(
      {
        eventType,
        expectedRevision,
        payload: { actor: currentUser.id, tool, ...payload },
        world: nextWorld,
      },
      {
        onError: async () => {
          setSyncNotice(
            'World changed remotely. Reloaded the latest snapshot.'
          );
          const result = await snapshotQuery.refetch();
          if (result.data) {
            setWorld(result.data.world ?? createDefaultWorld());
            setNpcs(result.data.npcs);
            setRevision(result.data.revision);
            revisionRef.current = result.data.revision;
          }
        },
        onSuccess: (data) => {
          setRevision(data.revision);
          revisionRef.current = data.revision;
          setSyncNotice(null);
        },
      }
    );
  };

  const placeTerrain = (position: HiveVector3) => {
    persistWorld(upsertBlock(world, position, activeTerrain), 'block.place');
  };

  const placeObject = (position: HiveVector3) => {
    const nextWorld = addObject(world, position, activeObject);
    if (nextWorld === world) {
      setSyncNotice('That object cannot be placed on this tile.');
      return;
    }
    persistWorld(nextWorld, 'object.place', {
      objectType: activeObject,
      position,
    });
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

  const moveSelection = (position: HiveVector3) => {
    if (!selection) return;

    if (selection.kind === 'object') {
      const nextWorld = moveObject(world, selection.id, position);
      if (nextWorld !== world) {
        persistWorld(nextWorld, 'object.move', {
          movedId: selection.id,
          position,
        });
      }
      return;
    }

    if (selection.kind === 'npc') {
      setNpcs((items) =>
        items.map((npc) =>
          npc.id === selection.id ? { ...npc, position } : npc
        )
      );
      mutations.updateNpc.mutate({
        npcId: selection.id,
        payload: { position },
      });
    }
  };

  const rotateSelection = () => {
    if (!selection || selection.kind !== 'object') return;
    persistWorld(rotateObject(world, selection.id), 'object.update', {
      rotatedId: selection.id,
    });
  };
  rotateSelectionRef.current = rotateSelection;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const terrain = terrainCatalog.find(
        (item) => item.shortcut?.toLowerCase() === key
      );
      if (terrain) {
        setActiveTerrain(terrain.id);
        setTool('terrain');
        return;
      }

      const object = objectCatalog.find(
        (item) => item.shortcut?.toLowerCase() === key
      );
      if (object) {
        setActiveObject(object.id);
        setTool('object');
        return;
      }

      if (key === 'v') setTool('select');
      if (key === 'e') setTool('erase');
      if (key === 'm') setTool('move');
      if (key === 'n') setTool('npc');
      if (key === 'r') {
        rotateSelectionRef.current();
        setTool('rotate');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    mutations.createServer.mutate(
      {
        description: 'Shared Hive research world',
        enabled: true,
        maxPlayers: 32,
        name: `Hive Lab ${serversQuery.data.servers.length + 1}`,
      },
      {
        onSuccess: ({ server }) => setServerId(server.id),
      }
    );
  };

  const createServerWithPayload = (
    payload: Pick<HiveServer, 'description' | 'enabled' | 'maxPlayers' | 'name'>
  ) => {
    mutations.createServer.mutate(payload, {
      onSuccess: ({ server }) => setServerId(server.id),
    });
  };

  const updateServer = (
    targetServerId: string,
    payload: Partial<
      Pick<HiveServer, 'description' | 'enabled' | 'maxPlayers' | 'name'>
    >
  ) => {
    mutations.updateServer.mutate({ payload, server: targetServerId });
  };

  const deleteServer = (targetServerId: string) => {
    mutations.deleteServer.mutate(targetServerId, {
      onSuccess: () => {
        const nextServer = serversQuery.data.servers.find(
          (server) => server.id !== targetServerId
        );
        setServerId(nextServer?.id ?? null);
      },
    });
  };

  const resetWorld = (mode: 'clear' | 'reseed') => {
    const nextWorld =
      mode === 'clear' ? createEmptyWorld() : createDefaultWorld();
    setSelection(null);
    persistWorld(nextWorld, `world.${mode}`, { mode });
  };

  return {
    activeObject,
    activeTerrain,
    createServer,
    createServerWithPayload,
    deleteServer,
    eraseSelection,
    isRunningNpc: mutations.runNpc.isPending,
    moveSelection,
    npcs,
    patchNpc,
    placeNpc,
    placeObject,
    placeTerrain,
    revision,
    resetWorld,
    rotateSelection,
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
    syncNotice,
    tool,
    updateServer,
    world,
  };
}
