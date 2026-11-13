import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const IEEAI_WORKSPACE_ID = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f';

export async function acceptIeeaiFreeInvite({
  admin,
  appId,
  allowedWorkspaceIds,
  authEmail,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  appId: string;
  allowedWorkspaceIds: string[];
  authEmail: string | null;
  userId: string;
  workspaceId: string;
}) {
  if (
    appId !== 'ieeai-stats' ||
    workspaceId !== IEEAI_WORKSPACE_ID ||
    !allowedWorkspaceIds.includes(IEEAI_WORKSPACE_ID) ||
    !authEmail
  ) {
    return false;
  }

  try {
    const { data, error } = await admin
      .schema('private')
      .rpc('accept_ieeai_free_workspace_invite', {
        p_actor_id: userId,
        p_allowed_workspace_ids: [IEEAI_WORKSPACE_ID],
        p_app_id: appId,
        p_workspace_id: workspaceId,
      });
    return !error && data === true;
  } catch {
    return false;
  }
}
