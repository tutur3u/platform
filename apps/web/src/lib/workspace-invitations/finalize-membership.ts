import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type FinalizeMembershipClient = {
  rpc: (
    functionName: 'finalize_workspace_invitation_membership',
    args: {
      p_member_type: 'GUEST' | 'MEMBER';
      p_role_id: string | null;
      p_user_id: string;
      p_ws_id: string;
    }
  ) => Promise<{ data: boolean | null; error: { message?: string } | null }>;
};

export async function finalizeInvitedWorkspaceMembership({
  admin,
  invitationType,
  roleId,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  invitationType: 'GUEST' | 'MEMBER';
  roleId: string | null | undefined;
  userId: string;
  workspaceId: string;
}) {
  const privateDb = admin.schema(
    'private'
  ) as unknown as FinalizeMembershipClient;
  const { data, error } = await privateDb.rpc(
    'finalize_workspace_invitation_membership',
    {
      p_member_type: invitationType,
      p_role_id: roleId ?? null,
      p_user_id: userId,
      p_ws_id: workspaceId,
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to finalize invited membership.');
  }

  return { created: data === true };
}
