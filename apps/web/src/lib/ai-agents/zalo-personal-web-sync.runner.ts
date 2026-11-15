import type { ZaloWebSyncJob } from './zalo-personal-web-sync';
import { executeZaloPersonalWebHistory } from './zalo-personal-web-sync.node';
import type { ZaloPersonalWebSyncOptions } from './zalo-personal-web-sync.types';

/** Off-Worker entry: the resolver must authorize the job and read current secrets. */
export async function runZaloWebSyncJob(
  job: ZaloWebSyncJob,
  resolveAuthorizedSession: (
    job: ZaloWebSyncJob
  ) => Promise<ZaloPersonalWebSyncOptions>
) {
  if (
    job.kind !== 'zalo-personal-web-sync' ||
    !job.agentId ||
    !job.channelId ||
    job.agentId.length > 128 ||
    job.channelId.length > 128 ||
    (job.syncTimeoutMs !== undefined &&
      (!Number.isFinite(job.syncTimeoutMs) ||
        job.syncTimeoutMs < 1 ||
        job.syncTimeoutMs > 120_000))
  ) {
    throw new Error('Invalid browser sync job');
  }
  const options = await resolveAuthorizedSession(job);
  if (options.agentId !== job.agentId || options.channelId !== job.channelId) {
    throw new Error('Browser job session identity mismatch');
  }
  return executeZaloPersonalWebHistory({
    ...options,
    syncTimeoutMs: job.syncTimeoutMs,
  });
}
