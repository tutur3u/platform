import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type FinalizeMembershipClient = {
  rpc: (
    functionName: 'finalize_workspace_invitation_membership_v2',
    args: {
      p_member_type: 'GUEST' | 'MEMBER';
      p_role_ids: string[];
      p_user_id: string;
      p_ws_id: string;
    }
  ) => Promise<{ data: boolean | null; error: { message?: string } | null }>;
};

export async function finalizeInvitedWorkspaceMembership({
  admin,
  invitationType,
  roleIds,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  invitationType: 'GUEST' | 'MEMBER';
  roleIds: string[];
  userId: string;
  workspaceId: string;
}) {
  const privateDb = admin.schema(
    'private'
  ) as unknown as FinalizeMembershipClient;
  const { data, error } = await privateDb.rpc(
    'finalize_workspace_invitation_membership_v2',
    {
      p_member_type: invitationType,
      p_role_ids: roleIds,
      p_user_id: userId,
      p_ws_id: workspaceId,
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to finalize invited membership.');
  }

  return { created: data === true };
}
