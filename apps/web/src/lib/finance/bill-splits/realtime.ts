import { publishChannelBroadcast } from '@tuturuuu/realtime/channels/server';
import { z } from 'zod';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';

const topic = z.tuple([z.literal('finance-bill-split'), z.uuid(), z.uuid()]);

export function billSplitRealtimeEnabled() {
  return (
    process.env.ENABLE_FINANCE_BILL_SPLITS === 'true' &&
    process.env.ENABLE_FINANCE_BILL_SPLIT_REALTIME === 'true'
  );
}

export async function billSplitRealtimeAllowed(wsId: string) {
  if (!billSplitRealtimeEnabled()) return false;
  try {
    return await verifySecret({
      wsId,
      forceAdmin: true,
      name: 'ENABLE_FINANCE_BILL_SPLIT_REALTIME',
      value: 'true',
    });
  } catch {
    return false;
  }
}

export function parseBillSplitTopic(value: string) {
  const parsed = topic.safeParse(value.split(':'));
  if (!parsed.success) return null;
  const [, wsId, splitId] = parsed.data;
  return { wsId, splitId };
}

export async function publishBillSplitActivity(
  workspaceId: string,
  splitId: string,
  activityId: string
) {
  if (!(await billSplitRealtimeAllowed(workspaceId))) return;
  try {
    await publishChannelBroadcast(
      `finance-bill-split:${workspaceId}:${splitId}`,
      { type: 'broadcast', event: 'activity', payload: { id: activityId } }
    );
  } catch {
    // The committed activity stays available through the private read API.
    console.warn('Bill split realtime invalidation unavailable');
  }
}
