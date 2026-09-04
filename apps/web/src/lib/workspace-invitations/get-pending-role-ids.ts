import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type PendingRoleIdsClient = {
  rpc: (
    functionName: 'get_workspace_invitation_role_ids',
    args: {
      p_email: null | string;
      p_user_id: null | string;
      p_ws_id: string;
    }
  ) => Promise<{
    data: string[] | null;
    error: { message?: string } | null;
  }>;
};

export async function getPendingWorkspaceInvitationRoleIds({
  admin,
  email,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  email?: null | string;
  userId?: null | string;
  workspaceId: string;
}) {
  const privateDb = admin.schema('private') as unknown as PendingRoleIdsClient;
  const { data, error } = await privateDb.rpc(
    'get_workspace_invitation_role_ids',
    {
      p_email: email?.trim().toLowerCase() ?? null,
      p_user_id: userId ?? null,
      p_ws_id: workspaceId,
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to read invited workspace roles.');
  }

  return [...new Set(data ?? [])];
}
