import { purgeAccountsAudit } from './accounts-audit-retention';
import type { WorkerProcessorId } from '../jobs';
import { purgeAiStudioRetention } from './ai-studio-retention';
import { recoverChatRevocations } from './chat-realtime-revocations';
import { expireCheckouts } from './checkout-expiry';
import { pruneCronHistory } from './cron-history-retention';
import { sweepUnauthorizedDevboxRuns } from './devbox-unauthorized-run-sweep';
import { dispatchBillSplitReminders } from './finance-bill-split-reminders';
import { eraseMeetAttendance } from './meet-attendance-erasure';
import { retainMeetAttendance } from './meet-attendance-retention';
import { purgeMeetTranscripts } from './meet-transcript-retention';
import { collectProviderCosts } from './provider-cost-collection';
import { cleanupQaTestUsers } from './qa-test-user-cleanup';
import { pruneStorageAccessEvents } from './storage-access-audit-retention';
import type { ProcessorContext, ProcessorResult } from './types';

export const WORKER_PROCESSORS: Record<
  WorkerProcessorId,
  (context: ProcessorContext) => Promise<ProcessorResult>
> = {
  'accounts-audit-retention': purgeAccountsAudit,
  'ai-studio-retention': purgeAiStudioRetention,
  'chat-realtime-revocations': recoverChatRevocations,
  'checkout-expiry': expireCheckouts,
  'cron-history-retention': pruneCronHistory,
  'devbox-unauthorized-run-sweep': sweepUnauthorizedDevboxRuns,
  'finance-bill-split-reminders': dispatchBillSplitReminders,
  'meet-attendance-erasure': eraseMeetAttendance,
  'meet-attendance-retention': retainMeetAttendance,
  'meet-transcript-retention': purgeMeetTranscripts,
  'provider-cost-collection': (context) => collectProviderCosts(context),
  'qa-test-user-cleanup': cleanupQaTestUsers,
  'storage-access-audit-retention': pruneStorageAccessEvents,
};
