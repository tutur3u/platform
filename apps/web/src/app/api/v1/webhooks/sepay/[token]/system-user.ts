import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { v5 as uuidv5 } from 'uuid';

type SepayAdminClient = TypedSupabaseClient;

const SEPAY_SYSTEM_USER_NAMESPACE = '5ecf2b6f-38f7-4608-a8be-39ba0f6d1537';

export async function ensureSystemVirtualUser(input: {
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const stableSystemUserId = uuidv5(
    `sepay-system:${input.wsId}`,
    SEPAY_SYSTEM_USER_NAMESPACE
  );

  const { data, error } = await input.sbAdmin
    .from('workspace_users')
    .upsert(
      {
        display_name: 'SePay System',
        full_name: 'SePay System',
        id: stableSystemUserId,
        note: 'System virtual user for SePay webhook ingestions',
        ws_id: input.wsId,
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error('Failed to resolve SePay system virtual user');
  }

  return data.id;
}
