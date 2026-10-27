import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function getPostEmailGroupMemberIds(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    groupId,
    userIds,
  }: { wsId: string; groupId: string; userIds: string[] }
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  const members = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await sbAdmin
      .from('workspace_user_groups_users')
      .select('user_id, workspace_users!inner(ws_id)')
      .eq('group_id', groupId)
      .eq('workspace_users.ws_id', wsId)
      .in('user_id', ids.slice(offset, offset + 200));
    if (error) throw error;
    if (!data) throw new Error('Unable to resolve post email participants');
    for (const row of data) members.add(row.user_id);
  }
  return members;
}
