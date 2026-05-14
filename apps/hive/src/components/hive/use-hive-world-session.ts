'use client';

import type { HiveRealtimeAwareness as HiveAwareness } from '@tuturuuu/realtime/hive';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  HiveNpc,
  HiveSelection,
  HiveServer,
  HiveSnapshotResponse,
  HiveWorldData,
} from '@/engine/types';
import { createDefaultWorld, createEmptyWorld } from '@/engine/world';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { shouldApplyHiveRealtimeRevision } from './hive-realtime-revision';

type UseHiveWorldSessionProps = {
  serverId: string | null;
  servers: HiveServer[];
  setPresenceCount: (count: number) => void;
  setRealtimeStatus: (status: HiveRealtimeStatus) => void;
  setRemoteAwareness: (awareness: HiveAwareness[]) => void;
  setServerId: (serverId: string | null) => void;
  snapshot?: HiveSnapshotResponse | null;
};

export function useHiveWorldSession({
  serverId,
  servers,
  setPresenceCount,
  setRealtimeStatus,
  setRemoteAwareness,
  setServerId,
  snapshot,
}: UseHiveWorldSessionProps) {
  const [world, setWorld] = useState<HiveWorldData>(createDefaultWorld());
  const [npcs, setNpcs] = useState<HiveNpc[]>([]);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const loadedServerIdRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<HiveSelection>(null);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    if (!snapshot || snapshot.server.id !== serverId) return;
    const isNewServer = loadedServerIdRef.current !== serverId;

    const shouldApplyWorld =
      isNewServer ||
      shouldApplyHiveRealtimeRevision(snapshot.revision, revisionRef.current);

    if (!shouldApplyWorld) {
      if (snapshot.revision === revisionRef.current) {
        setNpcs(snapshot.npcs);
      }
      return;
    }

    setWorld(snapshot.world ?? createDefaultWorld());
    setNpcs(snapshot.npcs);
    setRevision(snapshot.revision);
    revisionRef.current = snapshot.revision;
    loadedServerIdRef.current = serverId;
  }, [serverId, snapshot]);

  useEffect(() => {
    if (servers.length === 0) {
      setServerId(null);
      setWorld(createEmptyWorld());
      setNpcs([]);
      setRevision(0);
      revisionRef.current = 0;
      loadedServerIdRef.current = null;
      setSelection(null);
      setPresenceCount(0);
      setRemoteAwareness([]);
      setRealtimeStatus('disconnected');
      return;
    }

    if (!serverId || !servers.some((server) => server.id === serverId)) {
      setServerId(servers[0]?.id ?? null);
    }
  }, [
    serverId,
    servers,
    setPresenceCount,
    setRealtimeStatus,
    setRemoteAwareness,
    setServerId,
  ]);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === serverId),
    [serverId, servers]
  );

  return {
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
  };
}
