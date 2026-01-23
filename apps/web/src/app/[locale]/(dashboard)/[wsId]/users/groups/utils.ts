import type { SupabaseClient } from '@tuturuuu/supabase';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { notFound } from 'next/navigation';
import type { ManagerUser } from './hooks';

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

/**
 * Escapes SQL LIKE wildcard characters (%, _, \) in a search string.
 * This prevents users from injecting wildcard patterns.
 */
export function escapeLikeWildcards(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function fetchManagersForGroups(
  supabase: SupabaseClient,
  groupIds: string[]
): Promise<Record<string, ManagerUser[]>> {
  if (groupIds.length === 0) return {};

  const { data: managersData, error: managersError } = await supabase
    .from('workspace_user_groups_users')
    .select(
      'group_id, user:workspace_users!inner(id, full_name, avatar_url, display_name, email)'
    )
    .in('group_id', groupIds)
    .eq('role', 'TEACHER');

  if (managersError) {
    console.error('Error fetching managers:', managersError);
    return {};
  }

  if (!managersData) return {};

  return managersData.reduce(
    (acc, item) => {
      if (!item.group_id) return acc;

      const groupId = item.group_id;
      if (!acc[groupId]) {
        acc[groupId] = [];
      }
      const groupManagers = acc[groupId];

      if (item.user) {
        groupManagers.push(item.user as ManagerUser);
      }
      return acc;
    },
    {} as Record<string, ManagerUser[]>
  );
}
