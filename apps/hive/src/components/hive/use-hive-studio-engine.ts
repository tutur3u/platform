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
import { useCallback, useRef, useState } from 'react';
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
  createHiveAwareness,
  useHiveRealtimeSession,
} from './use-hive-realtime-session';
import { useHiveWorldSession } from './use-hive-world-session';
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
  const [tool, setTool] = useState<HiveTool>('select');
  const [activeBuildMode, setActiveBuildMode] =
    useState<HiveBuildMode>('terrain');
  const [activeTerrain, setActiveTerrain] = useState('grass');
  const [activeObject, setActiveObject] = useState('house');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<HiveRealtimeStatus>('disconnected');
  const [presenceCount, setPresenceCount] = useState(0);
  const [remoteAwareness, setRemoteAwareness] = useState<HiveAwareness[]>([]);
  const worldEventConflictCooldownRef = useRef(0);
  const worldEventInFlightRef = useRef(false);
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
    patchNpc: editorActions.patchNpc,
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
