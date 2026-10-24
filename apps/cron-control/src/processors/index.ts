import { expireCheckouts } from './checkout-expiry';
import type { ProcessorContext, ProcessorResult } from './types';

export const WORKER_PROCESSORS: Record<
  'checkout-expiry',
  (context: ProcessorContext) => Promise<ProcessorResult>
> = {
  'checkout-expiry': expireCheckouts,
};
