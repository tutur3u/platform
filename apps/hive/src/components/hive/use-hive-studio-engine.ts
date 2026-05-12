'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  HiveBuildMode,
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
import {
  connectHiveRealtime,
  type HiveRealtimeClient,
  type HiveRealtimeStatus,
} from '@/realtime/hive-realtime-client';
import { useHiveKeyboardShortcuts } from './use-hive-keyboard-shortcuts';
import { useHiveTimeOfDay } from './use-hive-time-of-day';
import { createWorldEventPersistence } from './use-world-event-persistence';

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
  const [selection, setSelection] = useState<HiveSelection>(null);
  const [tool, setTool] = useState<HiveTool>('select');
  const [activeBuildMode, setActiveBuildMode] =
    useState<HiveBuildMode>('terrain');
  const [activeTerrain, setActiveTerrain] = useState('grass');
  const [activeObject, setActiveObject] = useState('house');
  const [gaplessMode, setGaplessMode] = useState(true);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<HiveRealtimeStatus>('disconnected');
  const [presenceCount, setPresenceCount] = useState(0);
  const realtimeClientRef = useRef<HiveRealtimeClient | null>(null);
  const timeOfDay = useHiveTimeOfDay();

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
        if (message.type === 'world.event') {
          if (message.world) setWorld(message.world);
          setRevision(message.event.revision);
          revisionRef.current = message.event.revision;
        }
        if (message.type === 'presence') {
          setPresenceCount(message.users.length);
        }
      },
      onStatus: setRealtimeStatus,
      token: tokenQuery.data.token,
      url: tokenQuery.data.url || realtimeUrl,
    });
    realtimeClientRef.current = client;

    client.send({
      selection: null,
      type: 'presence.join',
      userId: currentUser.id,
    });

    return () => {
      realtimeClientRef.current = null;
      setRealtimeStatus('disconnected');
      setPresenceCount(0);
      client.close();
    };
  }, [currentUser.id, realtimeUrl, serverId, tokenQuery.data]);

  const selectedServer = useMemo(
    () => serversQuery.data.servers.find((server) => server.id === serverId),
    [serverId, serversQuery.data.servers]
  );

  const persistWorld = createWorldEventPersistence({
    createWorldEvent: mutations.createWorldEvent,
    currentUserId: currentUser.id,
    revisionRef,
    serverId,
    setNpcs,
    setRevision,
    setSyncNotice,
    setWorld,
    snapshotQuery,
    tool,
    onPersisted: ({ event, world }) => {
      realtimeClientRef.current?.send({
        event,
        type: 'world.event.applied',
        world,
      });
    },
  });

  const placeTerrain = (position: HiveVector3) => {
    persistWorld(
      upsertBlock(world, position, activeTerrain),
      'block.place',
      {
        blockType: activeTerrain,
        position,
      },
      {
        rebase: (latestWorld) =>
          upsertBlock(latestWorld, position, activeTerrain),
      }
    );
  };

  const placeObject = (position: HiveVector3) => {
    const nextWorld = addObject(world, position, activeObject);
    if (nextWorld === world) {
      setSyncNotice('That object cannot be placed on this tile.');
      return;
    }
    persistWorld(
      nextWorld,
      'object.place',
      {
        objectType: activeObject,
        position,
      },
      {
        rebase: (latestWorld) => addObject(latestWorld, position, activeObject),
      }
    );
  };

  const placeNpc = (position: HiveVector3) => {
    if (!serverId) return;
    mutations.createNpc.mutate({
      backstory: 'A new participant in the Hive research settlement.',
      name: `NPC ${npcs.length + 1}`,
      position,
      role: 'settlement observer',
      settings: {
        agentMode: 'llm',
        autonomous: false,
        decisionPolicy: 'manual',
      },
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

    persistWorld(
      result.world,
      `${target.kind}.remove`,
      {
        erasedId: target.id,
        erasedKind: target.kind,
      },
      {
        rebase: (latestWorld) =>
          removeSelection(latestWorld, npcs, target).world,
      }
    );
  };

  const moveSelection = (position: HiveVector3) => {
    if (!selection) return;

    if (selection.kind === 'object') {
      const nextWorld = moveObject(world, selection.id, position);
      if (nextWorld !== world) {
        persistWorld(
          nextWorld,
          'object.move',
          {
            movedId: selection.id,
            position,
          },
          {
            rebase: (latestWorld) =>
              moveObject(latestWorld, selection.id, position),
          }
        );
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
    persistWorld(
      rotateObject(world, selection.id),
      'object.update',
      {
        rotatedId: selection.id,
      },
      {
        rebase: (latestWorld) => rotateObject(latestWorld, selection.id),
      }
    );
  };

  useHiveKeyboardShortcuts({
    onRotateSelection: rotateSelection,
    setActiveBuildMode,
    setActiveObject,
    setActiveTerrain,
    setTool,
  });

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
    persistWorld(
      nextWorld,
      `world.${mode}`,
      { mode },
      {
        rebase: () => nextWorld,
      }
    );
  };

  return {
    activeBuildMode,
    activeObject,
    activeTerrain,
    autoTimeEnabled: timeOfDay.autoTimeEnabled,
    autoTimeSpeed: timeOfDay.autoTimeSpeed,
    createServerWithPayload,
    deleteServer,
    eraseSelection,
    eventsCount: snapshotQuery.data?.events.length ?? 0,
    gaplessMode,
    isRunningNpc: mutations.runNpc.isPending,
    moveSelection,
    npcs,
    patchNpc,
    placeNpc,
    placeObject,
    placeTerrain,
    presenceCount,
    realtimeStatus,
    revision,
    resetWorld,
    rotateSelection,
    runNpc,
    selectedServer,
    selection,
    serverId,
    servers: serversQuery.data.servers,
    setActiveBuildMode,
    setActiveObject,
    setActiveTerrain,
    setAutoTimeSpeed: timeOfDay.setAutoTimeSpeed,
    setGaplessMode,
    setSelection,
    setServerId,
    setTool,
    setTimeTheme: timeOfDay.setTimeTheme,
    setAutoTimeEnabled: timeOfDay.setAutoTimeEnabled,
    simulatedMinutes: timeOfDay.simulatedMinutes,
    syncNotice,
    timeTheme: timeOfDay.timeTheme,
    tool,
    updateServer,
    world,
  };
}
