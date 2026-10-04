import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { hasEducationEnabled, TulearnAccessError } from '../tulearn/access';

export type TodoKind = 'tutoring' | 'assignments' | 'lessons' | 'tests';
export type TodoApp = 'learn' | 'teach';
export interface TodoRow {
  id: string;
  title: string | null;
  participantName: string | null;
  courseId: string | null;
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  completed: boolean;
}

/** Only the signed-in actor's own link is eligible; no parent-selected subject. */
export async function resolveTodoActor(
  db: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  if (!(await hasEducationEnabled(wsId, db)))
    throw new TulearnAccessError('Education is not enabled', 404);
  const { data, error } = await db
    .from('workspace_user_linked_users')
    .select('virtual_user_id, workspace_users!inner(ws_id)')
    .eq('ws_id', wsId)
    .eq('platform_user_id', userId)
    .eq('workspace_users.ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  return data?.virtual_user_id ?? null;
}

async function assignedGroups(
  db: TypedSupabaseClient,
  wsId: string,
  actorId: string,
  app: TodoApp
) {
  const ids: string[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    let query = db
      .from('workspace_user_groups_users')
      .select(
        'group_id, workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(ws_id, archived, is_guest, is_course_published)'
      )
      .eq('user_id', actorId)
      .eq('role', app === 'teach' ? 'TEACHER' : 'STUDENT')
      .eq('workspace_user_groups.ws_id', wsId)
      .eq('workspace_user_groups.archived', false)
      .eq('workspace_user_groups.is_guest', false);
    if (app === 'learn')
      query = query.eq('workspace_user_groups.is_course_published', true);
    const { data, error } = await query
      .order('group_id')
      .range(offset, offset + 99);
    if (error) throw error;
    ids.push(...(data ?? []).map((row) => row.group_id));
    if ((data ?? []).length < 100) return ids;
  }
  throw new Error('Assigned course scope exceeds the supported bound');
}

export async function listEducationTodo({
  db,
  wsId,
  userId,
  app,
  kind,
  page,
  pageSize,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  userId: string;
  app: TodoApp;
  kind: TodoKind;
  page: number;
  pageSize: number;
}) {
  const actorId = await resolveTodoActor(db, wsId, userId);
  const empty = {
    data: [] as TodoRow[],
    count: 0,
    page,
    pageSize,
    totalPages: 0,
  };
  if (!actorId) return empty;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  if (kind === 'tutoring') {
    // Assignment is explicit; a tutor does not need to be the learner's homeroom teacher.
    const { data, error, count } = await db
      .schema('private')
      .from('workspace_tutoring_sessions')
      .select(
        'id, group_id, student_user_id, teacher_user_id, content, session_date, start_time, duration_minutes',
        { count: 'exact' }
      )
      .eq('ws_id', wsId)
      .eq(app === 'teach' ? 'teacher_user_id' : 'student_user_id', actorId)
      .eq('attendance_status', 'PENDING')
      .is('resolved_at', null)
      .order('session_date')
      .order('start_time')
      .order('id')
      .range(from, to);
    if (error) throw error;
    const participantIds = [
      ...new Set(
        (data ?? [])
          .map((row) =>
            app === 'teach' ? row.student_user_id : row.teacher_user_id
          )
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const participants = participantIds.length
      ? await db
          .from('workspace_users')
          .select('id, full_name, display_name')
          .eq('ws_id', wsId)
          .in('id', participantIds)
      : { data: [], error: null };
    if (participants.error) throw participants.error;
    const names = new Map(
      (participants.data ?? []).map((row) => [
        row.id,
        row.display_name || row.full_name,
      ])
    );
    return {
      ...empty,
      data: (data ?? []).map((row) => ({
        id: row.id,
        participantName:
          names.get(
            (app === 'teach' ? row.student_user_id : row.teacher_user_id) ?? ''
          ) ?? null,
        title: row.content || null,
        courseId: row.group_id,
        date: row.session_date,
        startTime: row.start_time,
        durationMinutes: row.duration_minutes,
        completed: false,
      })),
      count: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }
  const courseIds = await assignedGroups(db, wsId, actorId, app);
  if (!courseIds.length) return empty;
  if (kind === 'tests') {
    const { data, error, count } = await db
      .from('course_tests')
      .select('id, name, course_id', { count: 'exact' })
      .in('course_id', courseIds)
      .eq('is_published', app === 'learn')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to);
    if (error) throw error;
    const ids = (data ?? []).map((row) => row.id);
    const attempts =
      app === 'learn' && ids.length
        ? await db
            .from('course_test_attempts')
            .select('test_id')
            .eq('user_id', userId)
            .not('submitted_at', 'is', null)
            .in('test_id', ids)
        : { data: [], error: null };
    if (attempts.error) throw attempts.error;
    const submitted = new Set((attempts.data ?? []).map((row) => row.test_id));
    return {
      ...empty,
      data: (data ?? []).map((row) => ({
        id: row.id,
        title: row.name,
        participantName: null,
        courseId: row.course_id,
        date: null,
        startTime: null,
        durationMinutes: null,
        completed: submitted.has(row.id),
      })),
      count: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }
  if (kind === 'lessons') {
    const { data, error, count } = await db
      .from('workspace_course_modules')
      .select('id, name, group_id, quiz_deadline', { count: 'exact' })
      .in('group_id', courseIds)
      .eq('is_published', app === 'learn')
      .order('sort_key')
      .order('id')
      .range(from, to);
    if (error) throw error;
    const ids = (data ?? []).map((row) => row.id);
    const completions =
      app === 'learn' && ids.length
        ? await db
            .from('course_module_completion_status')
            .select('module_id')
            .eq('user_id', userId)
            .eq('completion_status', true)
            .in('module_id', ids)
        : { data: [], error: null };
    if (completions.error) throw completions.error;
    const completed = new Set(
      (completions.data ?? []).map((row) => row.module_id)
    );
    return {
      ...empty,
      data: (data ?? []).map((row) => ({
        id: row.id,
        title: row.name,
        participantName: null,
        courseId: row.group_id,
        date: row.quiz_deadline,
        startTime: null,
        durationMinutes: null,
        completed: completed.has(row.id),
      })),
      count: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }
  let query = db
    .schema('private')
    .from('user_group_posts')
    .select('id, title, group_id, created_at', { count: 'exact' })
    .in('group_id', courseIds);
  if (app === 'learn') query = query.eq('post_approval_status', 'APPROVED');
  else
    query = query
      .eq('creator_id', actorId)
      .neq('post_approval_status', 'APPROVED');
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to);
  if (error) throw error;
  const ids = (data ?? []).map((row) => row.id);
  const checks =
    app === 'learn' && ids.length
      ? await db
          .schema('private')
          .from('user_group_post_checks')
          .select('post_id')
          .eq('user_id', actorId)
          .eq('is_completed', true)
          .in('post_id', ids)
      : { data: [], error: null };
  if (checks.error) throw checks.error;
  const completed = new Set((checks.data ?? []).map((row) => row.post_id));
  return {
    ...empty,
    data: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      courseId: row.group_id,
      date: null,
      startTime: null,
      durationMinutes: null,
      participantName: null,
      completed: completed.has(row.id),
    })),
    count: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}
