import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { LmsLearnerScope } from './lms-learning-access';
import type { LmsStaffScope } from './lms-staff-access';

type AttendanceRow = {
  id: string;
  date: string;
  user_id: string;
  session_id: string | null;
  status: string;
};

export async function listLmsClassAttendance({
  db,
  wsId,
  scope,
  classId,
  from,
  to,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  scope: LmsLearnerScope | LmsStaffScope;
  classId: string;
  from: string;
  to: string;
  after?: { date: string; id: string };
  limit: number;
}): Promise<AttendanceRow[] | null> {
  const enrollmentJoin =
    scope.kind === 'administrator'
      ? ''
      : ', enrollment:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id))';
  const query = db
    .from('workspace_user_groups')
    .select(
      `id, marks:user_group_attendance!user_group_attendance_group_id_fkey(id, date, user_id, session_id, status, contact:workspace_users!user_group_attendance_user_id_fkey!inner(id))${enrollmentJoin}`
    )
    .eq('ws_id', wsId)
    .eq('id', classId)
    .eq('archived', false)
    .eq('is_guest', false)
    .eq('marks.contact.ws_id', wsId)
    .gte('marks.date', from)
    .lt('marks.date', to)
    .order('date', { referencedTable: 'marks' })
    .order('id', { referencedTable: 'marks' })
    .limit(limit, { referencedTable: 'marks' });

  if (scope.kind !== 'administrator') {
    query
      .eq('enrollment.user_id', scope.contactId)
      .eq('enrollment.role', scope.kind === 'teacher' ? 'TEACHER' : 'STUDENT')
      .eq('enrollment.contact.ws_id', wsId)
      .eq('enrollment.contact.archived', false);
  }
  if (scope.kind === 'student') {
    query.eq('is_course_published', true).eq('marks.user_id', scope.contactId);
  }
  if (after) {
    query.or(
      `date.gt.${after.date},and(date.eq.${after.date},id.gt.${after.id})`,
      { referencedTable: 'marks' }
    );
  }

  const { data, error } = await query
    .maybeSingle()
    .overrideTypes<{ id: string; marks: AttendanceRow[] }, { merge: false }>();
  if (error) throw error;
  return data?.marks ?? null;
}
