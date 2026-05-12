'use client';

import type {
  HiveWorldEvent,
  HiveWorldEventPayload,
} from '@tuturuuu/internal-api';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HiveNpc, HiveTool, HiveWorldData } from '@/engine/types';
import { createDefaultWorld } from '@/engine/world';

type PersistWorldOptions = {
  rebase?: (latestWorld: HiveWorldData) => HiveWorldData;
};

type WorldEventMutation = {
  isPending: boolean;
  mutate: (
    payload: HiveWorldEventPayload,
    options: {
      onError: () => Promise<void>;
      onSuccess: (data: { event: HiveWorldEvent; revision: number }) => void;
    }
  ) => void;
};

type SnapshotQuery = {
  refetch: () => Promise<{
    data?: {
      npcs: HiveNpc[];
      revision: number;
      world: HiveWorldData;
    } | null;
  }>;
};

type CreateWorldEventPersistenceOptions = {
  currentUserId: string;
  createWorldEvent: WorldEventMutation;
  conflictCooldownRef: MutableRefObject<number>;
  inFlightRef: MutableRefObject<boolean>;
  revisionRef: MutableRefObject<number>;
  serverId: string | null;
  setNpcs: Dispatch<SetStateAction<HiveNpc[]>>;
  setRevision: Dispatch<SetStateAction<number>>;
  setSyncNotice: Dispatch<SetStateAction<string | null>>;
  setWorld: Dispatch<SetStateAction<HiveWorldData>>;
  snapshotQuery: SnapshotQuery;
  tool: HiveTool;
  onPersisted?: (data: {
    event: HiveWorldEvent;
    revision: number;
    world: HiveWorldData;
  }) => void;
};

export function createWorldEventPersistence({
  currentUserId,
  createWorldEvent,
  conflictCooldownRef,
  revisionRef,
  inFlightRef,
  serverId,
  setNpcs,
  setRevision,
  setSyncNotice,
  setWorld,
  snapshotQuery,
  tool,
  onPersisted,
}: CreateWorldEventPersistenceOptions) {
  return function persistWorld(
    nextWorld: HiveWorldData,
    eventType: string,
    payload: Record<string, unknown> = {},
    _options: PersistWorldOptions = {}
  ) {
    if (!serverId) return;

    const now = Date.now();

    if (createWorldEvent.isPending || inFlightRef.current) {
      setWorld(nextWorld);
      setSyncNotice('Saving the previous world edit before sending another.');
      return;
    }

    if (conflictCooldownRef.current > now) {
      setWorld(nextWorld);
      setSyncNotice('World is syncing. Wait a moment before editing again.');
      return;
    }

    const actorPayload = { actor: currentUserId, tool, ...payload };
    const commitWorldEvent = (
      worldToPersist: HiveWorldData,
      expectedRevision: number
    ) => {
      inFlightRef.current = true;
      createWorldEvent.mutate(
        {
          eventType,
          expectedRevision,
          payload: actorPayload,
          world: worldToPersist,
        },
        {
          onError: async () => {
            inFlightRef.current = false;
            conflictCooldownRef.current = Date.now() + 1500;
            const result = await snapshotQuery.refetch();
            const latestWorld = result.data?.world ?? createDefaultWorld();

            if (result.data) {
              setWorld(latestWorld);
              setNpcs(result.data.npcs);
              setRevision(result.data.revision);
              revisionRef.current = result.data.revision;
            }

            setSyncNotice('World changed remotely. Reloaded the latest state.');
          },
          onSuccess: (data) => {
            inFlightRef.current = false;
            conflictCooldownRef.current = 0;
            setRevision(data.revision);
            revisionRef.current = data.revision;
            setSyncNotice(null);
            onPersisted?.({ ...data, world: worldToPersist });
          },
        }
      );
    };

    setWorld(nextWorld);
    commitWorldEvent(nextWorld, revisionRef.current);
  };
}
