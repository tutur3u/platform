import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const INVENTORY_REALTIME_SECRET = 'ENABLE_INVENTORY_REALTIME_BROADCAST';

export async function isInventoryRealtimeEnabled(wsId: string) {
  return verifySecret({
    wsId,
    forceAdmin: true,
    name: INVENTORY_REALTIME_SECRET,
    value: 'true',
  });
}
