import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { LmsLearnerScope } from './lms-learning-access';
import type { LmsStaffScope } from './lms-staff-access';

type LessonRow = {
  id: string;
  name: string;
  sort_key: number;
  is_published: boolean;
};

export async function listLmsClassLessons({
  db,
  wsId,
  scope,
  classId,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  scope: LmsLearnerScope | LmsStaffScope;
  classId: string;
  after?: { sortKey: number; id: string };
  limit: number;
}): Promise<LessonRow[] | null> {
  const enrollmentJoin =
    scope.kind === 'administrator'
      ? ''
      : ', enrollment:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id))';
  const query = db
    .from('workspace_user_groups')
    .select(
      `id, lessons:workspace_course_modules!workspace_course_modules_group_id_fkey(id, name, sort_key, is_published)${enrollmentJoin}`
    )
    .eq('ws_id', wsId)
    .eq('id', classId)
    .eq('archived', false)
    .eq('is_guest', false)
    .order('sort_key', { referencedTable: 'lessons' })
    .order('id', { referencedTable: 'lessons' })
    .limit(limit, { referencedTable: 'lessons' });

  if (scope.kind !== 'administrator') {
    query
      .eq('enrollment.user_id', scope.contactId)
      .eq('enrollment.role', scope.kind === 'teacher' ? 'TEACHER' : 'STUDENT')
      .eq('enrollment.contact.ws_id', wsId)
      .eq('enrollment.contact.archived', false);
  }
  if (scope.kind === 'student') {
    query.eq('is_course_published', true).eq('lessons.is_published', true);
  }
  if (after) {
    query.or(
      `sort_key.gt.${after.sortKey},and(sort_key.eq.${after.sortKey},id.gt.${after.id})`,
      { referencedTable: 'lessons' }
    );
  }

  const { data, error } = await query
    .overrideTypes<{ id: string; lessons: LessonRow[] }[], { merge: false }>()
    .maybeSingle();
  if (error) throw error;
  return data?.lessons ?? null;
}
