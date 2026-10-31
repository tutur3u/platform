import { callMaintenanceRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

export function pruneCronHistory(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'prune_cron_history', [
    'pg_cron_deleted',
    'managed_deleted',
  ]);
}
