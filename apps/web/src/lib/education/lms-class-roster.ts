import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { LmsStaffScope } from './lms-staff-access';

type RawRosterMember = {
  user_id: string;
  role: string | null;
  created_at: string | null;
  contact: { display_name: string | null; full_name: string | null };
};

export async function listLmsClassRoster({
  db,
  wsId,
  scope,
  classId,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  scope: LmsStaffScope;
  classId: string;
  after?: string;
  limit: number;
}) {
  // Evaluate the teaching assignment and read the roster in the same query.
  const teacherJoin =
    scope.kind === 'teacher'
      ? ', teacher:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id))'
      : '';
  const query = db
    .from('workspace_user_groups')
    .select(
      `id, roster:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey(user_id, role, created_at, contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(display_name, full_name))${teacherJoin}`
    )
    .eq('ws_id', wsId)
    .eq('id', classId)
    .eq('archived', false)
    .eq('is_guest', false)
    .eq('roster.contact.ws_id', wsId)
    .eq('roster.contact.archived', false)
    .order('user_id', { referencedTable: 'roster' })
    .limit(limit, { referencedTable: 'roster' });

  if (scope.kind === 'teacher') {
    query
      .eq('teacher.user_id', scope.contactId)
      .eq('teacher.role', 'TEACHER')
      .eq('teacher.contact.ws_id', wsId)
      .eq('teacher.contact.archived', false);
  }
  if (after) query.gt('roster.user_id', after);

  const { data, error } = await query
    .maybeSingle()
    .overrideTypes<
      { id: string; roster: RawRosterMember[] },
      { merge: false }
    >();
  if (error) throw error;
  if (!data) return null;
  return data.roster.map(({ user_id, role, created_at, contact }) => ({
    contact_id: user_id,
    name: contact.full_name?.trim() || contact.display_name?.trim() || null,
    role,
    joined_at: created_at,
    updated_at: null,
  }));
}
