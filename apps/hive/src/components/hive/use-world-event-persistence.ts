'use client';

import type { HiveWorldEventPayload } from '@tuturuuu/internal-api';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HiveNpc, HiveTool, HiveWorldData } from '@/engine/types';
import { createDefaultWorld } from '@/engine/world';

type PersistWorldOptions = {
  rebase?: (latestWorld: HiveWorldData) => HiveWorldData;
};

type WorldEventMutation = {
  mutate: (
    payload: HiveWorldEventPayload,
    options: {
      onError: () => Promise<void>;
      onSuccess: (data: { revision: number }) => void;
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
  revisionRef: MutableRefObject<number>;
  serverId: string | null;
  setNpcs: Dispatch<SetStateAction<HiveNpc[]>>;
  setRevision: Dispatch<SetStateAction<number>>;
  setSyncNotice: Dispatch<SetStateAction<string | null>>;
  setWorld: Dispatch<SetStateAction<HiveWorldData>>;
  snapshotQuery: SnapshotQuery;
  tool: HiveTool;
};

export function createWorldEventPersistence({
  currentUserId,
  createWorldEvent,
  revisionRef,
  serverId,
  setNpcs,
  setRevision,
  setSyncNotice,
  setWorld,
  snapshotQuery,
  tool,
}: CreateWorldEventPersistenceOptions) {
  return function persistWorld(
    nextWorld: HiveWorldData,
    eventType: string,
    payload: Record<string, unknown> = {},
    options: PersistWorldOptions = {}
  ) {
    if (!serverId) return;

    const actorPayload = { actor: currentUserId, tool, ...payload };
    const commitWorldEvent = (
      worldToPersist: HiveWorldData,
      expectedRevision: number,
      retrying = false
    ) => {
      createWorldEvent.mutate(
        {
          eventType,
          expectedRevision,
          payload: actorPayload,
          world: worldToPersist,
        },
        {
          onError: async () => {
            const result = await snapshotQuery.refetch();
            const latestWorld = result.data?.world ?? createDefaultWorld();

            if (result.data) {
              setWorld(latestWorld);
              setNpcs(result.data.npcs);
              setRevision(result.data.revision);
              revisionRef.current = result.data.revision;
            }

            if (retrying || !result.data || !options.rebase) {
              setSyncNotice(
                retrying
                  ? 'World edit could not be saved after sync.'
                  : 'World changed remotely. Reloaded the latest snapshot.'
              );
              return;
            }

            const rebasedWorld = options.rebase(latestWorld);
            setWorld(rebasedWorld);
            setSyncNotice('World changed remotely. Retrying edit.');
            commitWorldEvent(rebasedWorld, result.data.revision, true);
          },
          onSuccess: (data) => {
            setRevision(data.revision);
            revisionRef.current = data.revision;
            setSyncNotice(null);
          },
        }
      );
    };

    setWorld(nextWorld);
    commitWorldEvent(nextWorld, revisionRef.current);
  };
}
