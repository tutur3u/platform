import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { readDeliveryVersion } from './delivery-state';
import { createSingleFlightMemo } from './edge-cache-core';

/**
 * Per-isolate delivery version: one primary-key read per workspace every 2 s,
 * shared by the version endpoint and the asset edge cache.
 */
export const deliveryVersionMemo = createSingleFlightMemo<number>({
  read: async (workspaceId) =>
    readDeliveryVersion(
      (await createAdminClient()) as TypedSupabaseClient,
      workspaceId
    ),
});
