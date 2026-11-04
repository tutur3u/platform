import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function resolveAiMemoryWorkspaceIdForUser({
  supabase,
  userId,
}: {
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  try {
    const { data: userPrivateDetails, error: detailsError } = await supabase
      .from('user_private_details')
      .select('default_workspace_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (detailsError) throw detailsError;

    if (userPrivateDetails?.default_workspace_id) {
      return userPrivateDetails.default_workspace_id;
    }

    const { data: personalWorkspace, error: personalError } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .limit(1)
      .maybeSingle();

    if (personalError) throw personalError;
    if (!personalWorkspace?.id)
      throw new Error('AI policy workspace unavailable');
    return personalWorkspace.id;
  } catch {
    throw new Error('AI policy workspace unavailable');
  }
}
