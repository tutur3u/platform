'use client';

import type {
  HiveServerPayload,
  HiveServersResponse,
} from '@tuturuuu/internal-api/hive';
import type { HiveRealtimeAwareness as HiveAwareness } from '@tuturuuu/realtime/hive';
import { useCallback, useEffect, useRef, useState } from 'react';
import { objectCatalog, terrainCatalog } from '@/engine/catalog';
import type {
  HiveBuildMode,
  HiveServer,
  HiveTool,
  HiveUser,
  HiveVector3,
} from '@/engine/types';
import {
  useHiveMutations,
  useHiveRealtimeToken,
  useHiveServers,
  useHiveSnapshot,
} from '@/hooks/use-hive-data';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { useHiveEditorActions } from './use-hive-editor-actions';
import { useHiveEnvironmentControls } from './use-hive-environment-controls';
import {
  isNullableString,
  useHivePersistedState,
} from './use-hive-persisted-state';
import {
  createHiveAwareness,
  useHiveRealtimeSession,
} from './use-hive-realtime-session';
import { useHiveWorldSession } from './use-hive-world-session';
import type { QueuedWorldEvent } from './use-world-event-persistence';
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
  const [serverId, setServerId] = useHivePersistedState<string | null>(
    'hive.editor.serverId',
    initialServers.servers[0]?.id ?? null,
    { validate: isNullableString }
  );
  const serversQuery = useHiveServers(initialServers);
  const snapshotQuery = useHiveSnapshot(serverId, null);
  const mutations = useHiveMutations(serverId);
  const tokenQuery = useHiveRealtimeToken(serverId);
  const [tool, setTool] = useHivePersistedState<HiveTool>(
    'hive.editor.tool',
    'select',
    { validate: isHiveTool }
  );
  const [activeBuildMode, setActiveBuildMode] =
    useHivePersistedState<HiveBuildMode>(
      'hive.editor.activeBuildMode',
      'terrain',
      { validate: isHiveBuildMode }
    );
  const [activeTerrain, setActiveTerrain] = useHivePersistedState(
    'hive.editor.activeTerrain',
    'grass',
    { validate: isTerrainId }
  );
  const [activeObject, setActiveObject] = useHivePersistedState(
    'hive.editor.activeObject',
    'house',
    { validate: isObjectId }
  );
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<HiveRealtimeStatus>('disconnected');
  const [presenceCount, setPresenceCount] = useState(0);
  const [remoteAwareness, setRemoteAwareness] = useState<HiveAwareness[]>([]);
  const worldEventConflictCooldownRef = useRef(0);
  const worldEventInFlightRef = useRef(false);
  const worldEventQueuedRef = useRef<QueuedWorldEvent | null>(null);
  const environment = useHiveEnvironmentControls();
  const {
    npcs,
    revision,
    revisionRef,
    selectedServer,
    selection,
    setNpcs,
    setRevision,
    setSelection,
    setWorld,
    world,
  } = useHiveWorldSession({
    serverId,
    servers: serversQuery.data.servers,
    setPresenceCount,
    setRealtimeStatus,
    setRemoteAwareness,
    setServerId,
    snapshot: snapshotQuery.data,
  });

  useEffect(() => {
    const nextServer =
      serversQuery.data.servers.find((server) => server.id === serverId) ??
      serversQuery.data.servers[0] ??
      null;

    if ((nextServer?.id ?? null) !== serverId) {
      setServerId(nextServer?.id ?? null);
    }
  }, [serverId, serversQuery.data.servers, setServerId]);

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
    queuedEventRef: worldEventQueuedRef,
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

  const editorActions = useHiveEditorActions({
    activeObject,
    activeTerrain,
    mutations,
    npcs,
    persistWorld,
    revision,
    selection,
    serverId,
    setActiveBuildMode,
    setActiveObject,
    setActiveTerrain,
    setNpcs,
    setSelection,
    setSyncNotice,
    setTool,
    world,
  });

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

  return {
    activeBuildMode,
    activeObject,
    activeTerrain,
    applyAgentInstruction: editorActions.applyAgentInstruction,
    autoTimeEnabled: environment.autoTimeEnabled,
    autoTimeSpeed: environment.autoTimeSpeed,
    cameraView: environment.cameraView,
    createServerWithPayload,
    deleteServer,
    eraseSelection: editorActions.eraseSelection,
    eventsCount: snapshotQuery.data?.events.length ?? 0,
    gaplessMode: environment.gaplessMode,
    isRunningNpc: mutations.runNpc.isPending,
    isRunningSimulationTick: mutations.runSimulationTick.isPending,
    moveSelection: editorActions.moveSelection,
    npcs,
    patchBlock: editorActions.patchBlock,
    patchNpc: editorActions.patchNpc,
    patchObject: editorActions.patchObject,
    placeNpc: editorActions.placeNpc,
    placeObject: editorActions.placeObject,
    placeTerrain: editorActions.placeTerrain,
    presenceCount,
    remoteAwareness,
    realtimeStatus,
    revision,
    resetWorld: editorActions.resetWorld,
    rotateSelection: editorActions.rotateSelection,
    runNpc: editorActions.runNpc,
    runSimulationTick,
    selectedServer,
    selection,
    serverId,
    servers: serversQuery.data.servers,
    setActiveBuildMode,
    setActiveObject,
    setActiveTerrain,
    setAutoTimeSpeed: environment.setAutoTimeSpeed,
    setCameraView: environment.setCameraView,
    setClockMinutes: environment.setClockMinutes,
    setGaplessMode: environment.setGaplessMode,
    setSeason: environment.setSeason,
    setSelection,
    setServerId,
    setTool,
    sendCursorPosition,
    setAutoTimeEnabled: environment.setAutoTimeEnabled,
    setWeather: environment.setWeather,
    simulatedMinutes: environment.simulatedMinutes,
    season: environment.season,
    syncNotice,
    timeTheme: environment.timeTheme,
    tool,
    updateServer,
    updateServerSettings,
    weather: environment.weather,
    world,
  };
}

function isHiveTool(value: unknown): value is HiveTool {
  return (
    value === 'select' ||
    value === 'build' ||
    value === 'erase' ||
    value === 'move' ||
    value === 'rotate'
  );
}

function isHiveBuildMode(value: unknown): value is HiveBuildMode {
  return value === 'terrain' || value === 'object' || value === 'npc';
}

function isTerrainId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    terrainCatalog.some((item) => item.id === value)
  );
}

function isObjectId(value: unknown): value is string {
  return (
    typeof value === 'string' && objectCatalog.some((item) => item.id === value)
  );
}
