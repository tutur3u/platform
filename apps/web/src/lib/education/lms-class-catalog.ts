import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const classFields = 'id, name, description, is_course_published';
const enrollmentRole = { teacher: 'TEACHER', student: 'STUDENT' } as const;

type ClassRow = {
  id: string;
  name: string;
  description: string | null;
  is_course_published: boolean;
};

type ClassScope =
  | { kind: 'administrator' }
  | { kind: 'teacher' | 'student'; contactId: string };

export async function listLmsClasses({
  db,
  wsId,
  scope,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  scope: ClassScope;
  after?: string;
  limit: number;
}): Promise<ClassRow[]> {
  if (scope.kind === 'administrator') {
    const query = db
      .from('workspace_user_groups')
      .select(classFields)
      .eq('ws_id', wsId)
      .eq('archived', false)
      .eq('is_guest', false)
      .order('id')
      .limit(limit);

    if (after) query.gt('id', after);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  const query = db
    .from('workspace_user_groups_users')
    .select(
      `group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(${classFields}), contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id)`
    )
    .eq('user_id', scope.contactId)
    .eq('role', enrollmentRole[scope.kind])
    .eq('contact.ws_id', wsId)
    .eq('contact.archived', false)
    .eq('group.ws_id', wsId)
    .eq('group.archived', false)
    .eq('group.is_guest', false)
    .order('group_id')
    .limit(limit);

  if (scope.kind === 'student') query.eq('group.is_course_published', true);
  if (after) query.gt('group_id', after);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(({ group }) => group);
}
