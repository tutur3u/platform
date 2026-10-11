import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { getPrivateNotificationClient } from './batched-helpers';

type Admin = Parameters<typeof getPrivateNotificationClient>[0];
export const BATCH_RECONCILIATION_REQUIRED = 'reconciliation_required';
const MARKERS = ['delivery_in_flight', BATCH_RECONCILIATION_REQUIRED];
const MAX_BATCHES = 50;
const MAX_LOGS = 1000;
const batchSchema = z.object({
  id: z.string(),
  ws_id: z.literal(ROOT_WORKSPACE_ID),
  error_message: z.enum(['delivery_in_flight', 'reconciliation_required']),
});
const logSchema = z.object({
  id: z.string(),
  batch_id: z.string(),
  status: z.string(),
  sent_at: z.string().nullable(),
  error_message: z.string().nullable(),
});
type Log = z.infer<typeof logSchema>;

// A persisted terminal log is application settlement evidence, not inbox proof.
export function hasTerminalDeliveryLogSnapshot(batchId: string, logs: Log[]) {
  return (
    logs.length > 0 &&
    logs.length <= MAX_LOGS &&
    new Set(logs.map((log) => log.id)).size === logs.length &&
    logs.every(
      (log) =>
        log.batch_id === batchId &&
        log.status === 'sent' &&
        log.sent_at !== null &&
        Number.isFinite(Date.parse(log.sent_at)) &&
        (log.error_message === null ||
          log.error_message.startsWith('skipped: '))
    )
  );
}

async function persistProcessingMarker(
  admin: Admin,
  batchId: string,
  marker: typeof BATCH_RECONCILIATION_REQUIRED | 'delivery_in_flight'
) {
  const { data, error } = await getPrivateNotificationClient(admin)
    .from('notification_batches')
    .update({ error_message: marker, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== batchId)
    throw new Error('Batch processing marker not persisted');
}

export async function beginBatchDeliveryAttempt(admin: Admin, batchId: string) {
  await persistProcessingMarker(admin, batchId, 'delivery_in_flight');
}

export async function markBatchReconciliationRequired(
  admin: Admin,
  batchId: string
) {
  await persistProcessingMarker(admin, batchId, BATCH_RECONCILIATION_REQUIRED);
}

// Read-only: never send, change delivery logs, or turn processing into retryable.
// Snapshot completeness alone cannot rule out concurrent queue inserts or prove
// an unknown provider outcome. An operator must resolve those separately.
export async function fetchNotificationBatchReconciliation(
  admin: Admin,
  deadline: number
) {
  if (Date.now() >= deadline) return [];
  const { data, error } = await getPrivateNotificationClient(admin)
    .from('notification_batches')
    .select('id, ws_id, error_message')
    .eq('status', 'processing')
    .eq('delivery_mode', 'batched')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .in('error_message', MARKERS)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_BATCHES);
  if (error) throw error;
  const batches = z.array(batchSchema).max(MAX_BATCHES).parse(data);
  const results: Array<{
    batch_id: string;
    terminal_log_snapshot: boolean;
    log_count: number;
  }> = [];
  for (const batch of batches) {
    if (Date.now() >= deadline) break;
    const { data: logData, error: logError } =
      await getPrivateNotificationClient(admin)
        .from('notification_delivery_log')
        .select('id, batch_id, status, sent_at, error_message')
        .eq('batch_id', batch.id)
        .order('id', { ascending: true })
        .range(0, MAX_LOGS);
    if (logError) throw logError;
    const logs = z
      .array(logSchema)
      .max(MAX_LOGS + 1)
      .parse(logData);
    results.push({
      batch_id: batch.id,
      terminal_log_snapshot: hasTerminalDeliveryLogSnapshot(batch.id, logs),
      log_count: logs.length,
    });
  }
  return results;
}
