import { getPrivateNotificationClient } from './immediate-helpers';

// Persist before contacting a provider: an interrupted request has an unknown
// outcome and must never be automatically replayed as a known delivery failure.
export async function beginDeliveryAttempt(
  admin: Parameters<typeof getPrivateNotificationClient>[0],
  batchId: string
) {
  const { error } = await getPrivateNotificationClient(admin)
    .from('notification_batches')
    .update({
      error_message: 'delivery_in_flight',
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('status', 'processing');
  if (error) throw error;
}
