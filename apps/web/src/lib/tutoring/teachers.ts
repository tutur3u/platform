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
      'id,full_name,display_name,memberships:workspace_user_groups_users!workspace_user_roles_users_user_id_fkey!inner(role,group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(ws_id),group_id)',
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

/**
 * Tutor and class roles are independent: TEACHER in a tutor group makes a
 * person a tutor, TEACHER in any other group makes them a class teacher, and
 * someone holding both keeps both.
 */
export function classifyWorkspaceTeacher(
  memberships: { group_id: string }[],
  tutorGroupIds: string[]
) {
  const tutorGroups = new Set(tutorGroupIds);
  return {
    isTutor: memberships.some((row) => tutorGroups.has(row.group_id)),
    isClassTeacher: memberships.some((row) => !tutorGroups.has(row.group_id)),
  };
}

/** Teachers of the tutor groups only; the page query then filters by id. */
export async function listWorkspaceTutorIds({
  normalizedWsId,
  sbAdmin,
  tutorGroupIds,
}: {
  normalizedWsId: string;
  sbAdmin: TypedSupabaseClient;
  tutorGroupIds: string[];
}) {
  if (!tutorGroupIds.length) return { tutorIds: [] as string[], error: null };
  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      'user_id,group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(ws_id)'
    )
    .eq('role', 'TEACHER')
    .eq('group.ws_id', normalizedWsId)
    .in('group_id', tutorGroupIds);
  return {
    tutorIds: [...new Set((data ?? []).map((row) => row.user_id))],
    error,
  };
}
