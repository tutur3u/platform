import { callMaintenanceRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

/** Cancels unauthorized queued devbox runs among the oldest 1,000 queued rows. */
export function sweepUnauthorizedDevboxRuns(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'cancel_unauthorized_devbox_runs', [
    'scanned',
    'cancelled',
  ]);
}
