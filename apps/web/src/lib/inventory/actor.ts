import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export async function getInventoryActorContext(req: Request, wsId: string) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authUserId: null,
      workspaceUserId: null,
    };
  }

  const { data } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  return {
    authUserId: user.id,
    workspaceUserId: data?.virtual_user_id ?? null,
  };
}
