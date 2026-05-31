import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export async function resolveAiMemoryWorkspaceIdForUser({
  fallbackWsId = ROOT_WORKSPACE_ID,
  supabase,
  userId,
}: {
  fallbackWsId?: string;
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  try {
    const { data: userPrivateDetails } = await supabase
      .from('user_private_details')
      .select('default_workspace_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (userPrivateDetails?.default_workspace_id) {
      return userPrivateDetails.default_workspace_id;
    }

    const { data: personalWorkspace } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .limit(1)
      .maybeSingle();

    return personalWorkspace?.id ?? fallbackWsId;
  } catch {
    return fallbackWsId;
  }
}
