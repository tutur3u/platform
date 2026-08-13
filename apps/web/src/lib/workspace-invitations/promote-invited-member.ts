import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function promoteInvitedWorkspaceMember({
  admin,
  invitationType,
  userId,
  workspaceId,
}: {
  admin: TypedSupabaseClient;
  invitationType: 'GUEST' | 'MEMBER';
  userId: string;
  workspaceId: string;
}) {
  if (invitationType !== 'MEMBER') return;

  const { error } = await admin
    .from('workspace_members')
    .update({ type: 'MEMBER' })
    .eq('ws_id', workspaceId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to promote invited member.');
  }
}
