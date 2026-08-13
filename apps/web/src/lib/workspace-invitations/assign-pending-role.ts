import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function assignPendingWorkspaceInviteRole({
  admin,
  roleId,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  roleId: string | null | undefined;
  userId: string;
  workspaceId: string;
}) {
  if (!roleId) return;

  const { data: role, error: roleError } = await admin
    .from('workspace_roles')
    .select('id')
    .eq('id', roleId)
    .eq('ws_id', workspaceId)
    .maybeSingle();

  if (roleError || !role) {
    throw new Error('The invited workspace role is no longer available.');
  }

  const { error: assignmentError } = await admin
    .from('workspace_role_members')
    .upsert(
      { role_id: roleId, user_id: userId },
      { ignoreDuplicates: true, onConflict: 'role_id,user_id' }
    );

  if (assignmentError) {
    throw new Error(
      assignmentError.message || 'Failed to assign the invited workspace role.'
    );
  }
}
