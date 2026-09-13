import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveStorageByteLimit } from './storage-quota';

export async function getStorageLimit(
  wsId: string,
  supabase?: TypedSupabaseClient
): Promise<number> {
  const client =
    supabase ?? ((await createDynamicAdminClient()) as TypedSupabaseClient);
  const { data, error } = await client.rpc('get_workspace_storage_limit', {
    p_ws_id: wsId,
  });

  if (error) {
    console.error('Error fetching storage limit:', error);
    return 0;
  }

  return resolveStorageByteLimit(data);
}
