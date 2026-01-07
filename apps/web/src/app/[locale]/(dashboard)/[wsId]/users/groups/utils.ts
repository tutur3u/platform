import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { notFound } from 'next/navigation';

export async function getUserGroupMemberships(wsId: string): Promise<string[]> {
  const supabase = await createClient();
  const workspaceUser = await getCurrentWorkspaceUser(wsId);

  if (!workspaceUser?.virtual_user_id) {
    return [];
  }

  const { data: memberships, error } = await supabase
    .from('workspace_user_groups_users')
    .select('group_id')
    .eq('user_id', workspaceUser.virtual_user_id);

  if (error) throw error;

  return Array.from(
    new Set((memberships || []).map((m) => m.group_id).filter(Boolean))
  ) as string[];
}

export async function verifyGroupAccess(wsId: string, groupId: string) {
  const supabase = await createClient();
  const workspaceUser = await getCurrentWorkspaceUser(wsId);

  if (!workspaceUser?.virtual_user_id) {
    console.error('No virtual user ID found for current workspace user');
    notFound();
  }

  const { data: membership, error } = await supabase
    .from('workspace_user_groups_users')
    .select('group_id')
    .eq('user_id', workspaceUser.virtual_user_id)
    .eq('group_id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!membership?.group_id) {
    console.error(`User does not have access to group ${groupId}`);
    notFound();
  }
}
