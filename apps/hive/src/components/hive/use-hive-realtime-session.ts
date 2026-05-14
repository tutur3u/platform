'use client';

import type { HiveRealtimeAwareness } from '@tuturuuu/realtime/hive';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
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
  connectHiveRealtime,
  type HiveRealtimeClient,
  type HiveRealtimeStatus,
} from '@/realtime/hive-realtime-client';

type UseHiveRealtimeSessionProps = {
  currentUserId: string;
  getOwnAwareness: (cursor?: HiveVector3 | null) => HiveRealtimeAwareness;
  realtimeUrl: string;
  serverId: string | null;
  setPresenceCount: (count: number) => void;
  setRealtimeStatus: (status: HiveRealtimeStatus) => void;
  setRemoteAwareness: Dispatch<SetStateAction<HiveRealtimeAwareness[]>>;
  setRevision: (revision: number) => void;
  setWorld: (world: HiveWorldData) => void;
  token?: string;
  tokenUrl?: string;
  revisionRef: MutableRefObject<number>;
};

export function createHiveAwareness({
  currentUser,
  cursor,
  npcs,
  selectedServer,
  selection,
  tool,
}: {
  currentUser: HiveUser;
  cursor?: HiveVector3 | null;
  npcs: HiveNpc[];
  selectedServer?: HiveServer | null;
  selection: HiveSelection;
  tool: HiveTool;
}): HiveRealtimeAwareness {
  return {
    activeTool: tool,
    avatarUrl: currentUser.avatarUrl ?? null,
    color: currentUser.id.endsWith('0') ? '#7cba62' : '#65a5d8',
    cursor,
    displayName:
      currentUser.displayName ||
      currentUser.handle ||
      currentUser.email ||
      'Hive researcher',
    focus: 'editor',
    lastSeenAt: new Date().toISOString(),
    role: selectedServer ? 'researcher' : 'member',
    selection: selection ? { id: selection.id, kind: selection.kind } : null,
    userId: currentUser.id,
    worldPosition:
      selection?.kind === 'npc'
        ? (npcs.find((npc) => npc.id === selection.id)?.position ?? null)
        : null,
  };
}

export function useHiveRealtimeSession({
  currentUserId,
  getOwnAwareness,
  realtimeUrl,
  revisionRef,
  serverId,
  setPresenceCount,
  setRealtimeStatus,
  setRemoteAwareness,
  setRevision,
  setWorld,
  token,
  tokenUrl,
}: UseHiveRealtimeSessionProps) {
  const realtimeClientRef = useRef<HiveRealtimeClient | null>(null);
  const getOwnAwarenessRef = useRef(getOwnAwareness);

  useEffect(() => {
    getOwnAwarenessRef.current = getOwnAwareness;
  }, [getOwnAwareness]);

  useEffect(() => {
    if (!token || !serverId) {
      realtimeClientRef.current = null;
      setRealtimeStatus('disconnected');
      setPresenceCount(0);
      return;
    }

    const client = connectHiveRealtime({
      onMessage: (message) => {
        if (message.type === 'sync.snapshot') {
          setWorld(message.world);
          setRevision(message.opSeq);
          revisionRef.current = message.opSeq;
        }
        if (message.type === 'sync.update') {
          if (message.world) setWorld(message.world);
          setRevision(message.opSeq);
          revisionRef.current = message.opSeq;
        }
        if (message.type === 'awareness.update') {
          setRemoteAwareness((items) => [
            message.awareness,
            ...items.filter((item) => item.userId !== message.awareness.userId),
          ]);
        }
        if (message.type === 'world.event') {
          if (message.world) setWorld(message.world);
          setRevision(message.event.revision);
          revisionRef.current = message.event.revision;
        }
        if (message.type === 'presence') {
          const awareness = message.awareness.filter(
            (item) => item.userId !== currentUserId
          );
          setPresenceCount(message.awareness.length);
          setRemoteAwareness(awareness);
        }
      },
      onStatus: setRealtimeStatus,
      token,
      url: tokenUrl || realtimeUrl,
    });
    realtimeClientRef.current = client;

    client.send({
      selection: null,
      type: 'presence.join',
      userId: currentUserId,
    });
    client.sendAwareness(getOwnAwarenessRef.current(null));

    return () => {
      realtimeClientRef.current = null;
      setPresenceCount(0);
      client.close();
    };
  }, [
    currentUserId,
    realtimeUrl,
    revisionRef,
    serverId,
    setPresenceCount,
    setRealtimeStatus,
    setRemoteAwareness,
    setRevision,
    setWorld,
    token,
    tokenUrl,
  ]);

  useEffect(() => {
    getOwnAwarenessRef.current = getOwnAwareness;
    realtimeClientRef.current?.sendAwareness(getOwnAwareness(null));
  }, [getOwnAwareness]);

  const sendCursorPosition = useCallback((position: HiveVector3 | null) => {
    realtimeClientRef.current?.sendAwareness(
      getOwnAwarenessRef.current(position)
    );
  }, []);

  return { realtimeClientRef, sendCursorPosition };
}
