import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

// Start from users so multiple teacher memberships produce one catalog entry.
// Scope both ends of the membership: a cross-workspace group cannot qualify.
export function workspaceTeachersQuery(
  sbAdmin: TypedSupabaseClient,
  wsId: string
) {
  return sbAdmin
    .from('workspace_users')
    .select(
      'id,full_name,display_name,memberships:workspace_user_groups_users!workspace_user_roles_users_user_id_fkey!inner(role,group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(ws_id))',
      { count: 'exact' }
    )
    .eq('ws_id', wsId)
    .eq('memberships.role', 'TEACHER')
    .eq('memberships.group.ws_id', wsId);
}

export async function listWorkspaceTeacherIds({
  normalizedWsId,
  sbAdmin,
  teacherUserIds,
}: {
  normalizedWsId: string;
  sbAdmin: TypedSupabaseClient;
  teacherUserIds: string[];
}) {
  if (!teacherUserIds.length)
    return { teacherIds: new Set<string>(), error: null };
  const { data, error } = await workspaceTeachersQuery(
    sbAdmin,
    normalizedWsId
  ).in('id', teacherUserIds);
  return {
    teacherIds: new Set((data ?? []).map((row) => row.id)),
    error,
  };
}
