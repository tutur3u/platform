import { callMaintenanceRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

export function settleUnbilledAiCharges(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'settle_unbilled_ai_charges', [
    'settled',
    'failed',
    'abandoned',
  ]);
}
