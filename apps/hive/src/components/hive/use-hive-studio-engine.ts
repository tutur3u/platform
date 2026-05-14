'use client';

import type {
  HiveServerPayload,
  HiveServersResponse,
} from '@tuturuuu/internal-api/hive';
import {
  bytesToBase64,
  encodeHiveWorldUpdate,
  type HiveRealtimeAwareness as HiveAwareness,
} from '@tuturuuu/realtime/hive';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyHiveAgentInstruction } from '@/engine/agent';
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
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { createDefaultNpcPayload } from './hive-npc-defaults';
import { useHiveKeyboardShortcuts } from './use-hive-keyboard-shortcuts';
import {
  createHiveAwareness,
  useHiveRealtimeSession,
} from './use-hive-realtime-session';
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
  const [remoteAwareness, setRemoteAwareness] = useState<HiveAwareness[]>([]);
  const worldEventConflictCooldownRef = useRef(0);
  const worldEventInFlightRef = useRef(false);
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

  const selectedServer = useMemo(
    () => serversQuery.data.servers.find((server) => server.id === serverId),
    [serverId, serversQuery.data.servers]
  );

  const getOwnAwareness = useCallback(
    (cursor?: HiveVector3 | null): HiveAwareness =>
      createHiveAwareness({
        currentUser,
        cursor,
        npcs,
        selectedServer,
        selection,
        tool,
      }),
    [currentUser, npcs, selectedServer, selection, tool]
  );

  const { realtimeClientRef, sendCursorPosition } = useHiveRealtimeSession({
    currentUserId: currentUser.id,
    getOwnAwareness,
    realtimeUrl,
    revisionRef,
    serverId,
    setPresenceCount,
    setRealtimeStatus,
    setRemoteAwareness,
    setRevision,
    setWorld,
    token: tokenQuery.data?.token,
    tokenUrl: tokenQuery.data?.url,
  });

  const persistWorld = createWorldEventPersistence({
    conflictCooldownRef: worldEventConflictCooldownRef,
    createWorldEvent: mutations.createWorldEvent,
    currentUserId: currentUser.id,
    inFlightRef: worldEventInFlightRef,
    revisionRef,
    serverId,
    setNpcs,
    setRevision,
    setSyncNotice,
    setWorld,
    snapshotQuery,
    tool,
    onPersisted: ({ event, world }) => {
      const encoded = encodeHiveWorldUpdate(world);
      realtimeClientRef.current?.send({
        stateVector: bytesToBase64(encoded.stateVector),
        type: 'sync.update',
        update: bytesToBase64(encoded.update),
        world,
      });
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
    mutations.createNpc.mutate(
      createDefaultNpcPayload(position, npcs.length + 1)
    );
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

  const createServerWithPayload = (payload: HiveServerPayload) => {
    mutations.createServer.mutate(payload, {
      onSuccess: ({ server }) => setServerId(server.id),
    });
  };

  const updateServer = (
    targetServerId: string,
    payload: Partial<HiveServerPayload>
  ) => {
    mutations.updateServer.mutate({ payload, server: targetServerId });
  };

  const updateServerSettings = (
    payload: NonNullable<HiveServer['settings']>
  ) => {
    if (!serverId) return;
    mutations.updateServerSettings.mutate(payload);
  };

  const runSimulationTick = () => {
    if (!serverId) return;
    mutations.runSimulationTick.mutate();
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

  const applyAgentInstruction = (prompt: string) => {
    if (!serverId) {
      return {
        actions: [],
        changed: false,
        summary: 'Select a Hive server before asking the agent to edit.',
        world,
      };
    }

    const result = applyHiveAgentInstruction(world, prompt);
    if (!result.changed) {
      setSyncNotice(result.summary);
      return result;
    }

    persistWorld(
      result.world,
      'agent.refine',
      {
        actions: result.actions,
        prompt,
      },
      {
        rebase: (latestWorld) =>
          applyHiveAgentInstruction(latestWorld, prompt).world,
      }
    );
    setSelection(null);
    setTool('select');
    return result;
  };

  return {
    activeBuildMode,
    activeObject,
    activeTerrain,
    applyAgentInstruction,
    autoTimeEnabled: timeOfDay.autoTimeEnabled,
    autoTimeSpeed: timeOfDay.autoTimeSpeed,
    createServerWithPayload,
    deleteServer,
    eraseSelection,
    eventsCount: snapshotQuery.data?.events.length ?? 0,
    gaplessMode,
    isRunningNpc: mutations.runNpc.isPending,
    isRunningSimulationTick: mutations.runSimulationTick.isPending,
    moveSelection,
    npcs,
    patchNpc,
    placeNpc,
    placeObject,
    placeTerrain,
    presenceCount,
    remoteAwareness,
    realtimeStatus,
    revision,
    resetWorld,
    rotateSelection,
    runNpc,
    runSimulationTick,
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
    sendCursorPosition,
    setTimeTheme: timeOfDay.setTimeTheme,
    setAutoTimeEnabled: timeOfDay.setAutoTimeEnabled,
    simulatedMinutes: timeOfDay.simulatedMinutes,
    syncNotice,
    timeTheme: timeOfDay.timeTheme,
    tool,
    updateServer,
    updateServerSettings,
    world,
  };
}
