import { fetchAllPaginatedRows } from './cron-helpers';

// Bound explicit selection before delivery-log, identity or device prefetch.
// Automatic draining keeps complete results until rollout-aware progress is durable.
export const MAX_IMMEDIATE_BATCHES_PER_REQUEST = 100;

export interface NotificationBatchRow {
  channel: string;
  email: string | null;
  id: string;
  user_id: string | null;
  window_end: string;
  ws_id: string | null;
}

export async function fetchPendingImmediateBatches(
  sbAdmin: any,
  batchIds: string[]
): Promise<NotificationBatchRow[]> {
  // Also protect direct callers before constructing a database request.
  if (batchIds.length > MAX_IMMEDIATE_BATCHES_PER_REQUEST) {
    throw new Error('Too many immediate batch IDs');
  }
  const buildQuery = () =>
    sbAdmin
      .schema('private')
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'immediate');
  if (batchIds.length === 0) {
    return fetchAllPaginatedRows<NotificationBatchRow>((from, to) =>
      buildQuery()
        .order('window_end', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    );
  }
  const { data, error } = await buildQuery()
    .in('id', [...new Set(batchIds)])
    .order('window_end', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_IMMEDIATE_BATCHES_PER_REQUEST);
  if (error) throw error;
  return data ?? [];
}
