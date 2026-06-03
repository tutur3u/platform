import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export async function getInventoryActorContext(req: Request, wsId: string) {
  const sbAdmin = await createAdminClient();
  const auth = await resolveSessionAuthContext(req, {
    allowAppSessionAuth: { targetApp: 'inventory' },
  });

  if (!auth.ok) {
    return {
      authUserId: null,
      workspaceUserId: null,
    };
  }

  const { data } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', auth.user.id)
    .eq('ws_id', wsId)
    .single();

  return {
    authUserId: auth.user.id,
    workspaceUserId: data?.virtual_user_id ?? null,
  };
}
