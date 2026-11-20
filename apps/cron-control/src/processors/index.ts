import type { WorkerProcessorId } from '../jobs';
import { purgeAiStudioRetention } from './ai-studio-retention';
import { expireCheckouts } from './checkout-expiry';
import { pruneCronHistory } from './cron-history-retention';
import { sweepUnauthorizedDevboxRuns } from './devbox-unauthorized-run-sweep';
import { dispatchBillSplitReminders } from './finance-bill-split-reminders';
import { eraseMeetAttendance } from './meet-attendance-erasure';
import { retainMeetAttendance } from './meet-attendance-retention';
import { purgeMeetTranscripts } from './meet-transcript-retention';
import { pruneStorageAccessEvents } from './storage-access-audit-retention';
import type { ProcessorContext, ProcessorResult } from './types';

export const WORKER_PROCESSORS: Record<
  WorkerProcessorId,
  (context: ProcessorContext) => Promise<ProcessorResult>
> = {
  'ai-studio-retention': purgeAiStudioRetention,
  'checkout-expiry': expireCheckouts,
  'cron-history-retention': pruneCronHistory,
  'devbox-unauthorized-run-sweep': sweepUnauthorizedDevboxRuns,
  'finance-bill-split-reminders': dispatchBillSplitReminders,
  'meet-attendance-erasure': eraseMeetAttendance,
  'meet-attendance-retention': retainMeetAttendance,
  'meet-transcript-retention': purgeMeetTranscripts,
  'storage-access-audit-retention': pruneStorageAccessEvents,
};
