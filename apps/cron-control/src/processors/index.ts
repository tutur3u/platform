import { expireCheckouts } from './checkout-expiry';
import { pruneCronHistory } from './cron-history-retention';
import type { ProcessorContext, ProcessorResult } from './types';

export const WORKER_PROCESSORS: Record<
  'checkout-expiry' | 'cron-history-retention',
  (context: ProcessorContext) => Promise<ProcessorResult>
> = {
  'checkout-expiry': expireCheckouts,
  'cron-history-retention': pruneCronHistory,
};
