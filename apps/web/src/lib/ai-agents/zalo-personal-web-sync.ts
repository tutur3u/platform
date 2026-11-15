import 'server-only';

import { isWorkerRuntime } from '../server-runtime';
import type {
  ZaloPersonalWebSyncOptions,
  ZaloPersonalWebSyncResult,
} from './zalo-personal-web-sync.types';
export type {
  ZaloPersonalWebSyncOptions,
  ZaloPersonalWebSyncResult,
  ZaloPersonalWebSyncStatus,
  ZaloPersonalWebSyncMessage,
} from './zalo-personal-web-sync.types';

/** A queue payload carries identifiers only. The runner resolves session secrets. */
export interface ZaloWebSyncJob {
  kind: 'zalo-personal-web-sync';
  agentId: string;
  channelId: string;
  syncTimeoutMs?: number;
}

export interface ZaloWebSyncQueue {
  /** Enqueue once and await the stored result; unknown outcomes must not replay. */
  enqueueAndWait(job: ZaloWebSyncJob): Promise<ZaloPersonalWebSyncResult>;
}

/** Node executes inline; a Worker requires an off-Worker queue adapter. */
export async function syncZaloPersonalWebHistory(
  options: ZaloPersonalWebSyncOptions,
  queue?: ZaloWebSyncQueue
): Promise<ZaloPersonalWebSyncResult> {
  const job: ZaloWebSyncJob = {
    kind: 'zalo-personal-web-sync',
    agentId: options.agentId,
    channelId: options.channelId,
    syncTimeoutMs: options.syncTimeoutMs,
  };
  if (queue) return queue.enqueueAndWait(job);
  if (isWorkerRuntime()) {
    throw new Error('Worker browser job queue is not configured');
  }
  const inlineQueue: ZaloWebSyncQueue = {
    enqueueAndWait: async () => {
      const { executeZaloPersonalWebHistory } =
        await import('./zalo-personal-web-sync.node');
      return executeZaloPersonalWebHistory(options);
    },
  };
  return inlineQueue.enqueueAndWait(job);
}
