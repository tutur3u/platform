import { callMaintenanceRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

/** Deletes at most 1,000 storage access audit rows older than 90 days. */
export function pruneStorageAccessEvents(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return callMaintenanceRpc(context, 'prune_storage_access_events', [
    'deleted',
  ]);
}
