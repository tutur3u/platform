import type { WorkerProcessorId } from '../jobs';
import { expireCheckouts } from './checkout-expiry';
import { pruneCronHistory } from './cron-history-retention';
import { purgeMeetTranscripts } from './meet-transcript-retention';
import { pruneStorageAccessEvents } from './storage-access-audit-retention';
import type { ProcessorContext, ProcessorResult } from './types';

export const WORKER_PROCESSORS: Record<
  WorkerProcessorId,
  (context: ProcessorContext) => Promise<ProcessorResult>
> = {
  'checkout-expiry': expireCheckouts,
  'cron-history-retention': pruneCronHistory,
  'meet-transcript-retention': purgeMeetTranscripts,
  'storage-access-audit-retention': pruneStorageAccessEvents,
};
