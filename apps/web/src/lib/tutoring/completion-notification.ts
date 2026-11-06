import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const TUTORING_COMPLETED_CODE = 'tutoring_session_completed';
export const TUTORING_SESSION_ENTITY = 'tutoring_session';
const NOTIFY_TIMEOUT_MS = 3000;

function nameOf(
  user:
    | {
        full_name: string | null;
        display_name: string | null;
        email: string | null;
      }
    | null
    | undefined
) {
  return (
    user?.full_name?.trim() ||
    user?.display_name?.trim() ||
    user?.email?.trim() ||
    'A learner'
  );
}

/**
 * Notifies a class's homeroom teachers (group members with role TEACHER and a
 * linked account) that one of its tutoring sessions was completed.
 *
 * At most one notification per session and recipient: recipients who already
 * have one for this session are skipped, so retries and repeat completions do
 * not duplicate it. Without a receipts table this check is best effort; two
 * completions racing within the same instant can both send.
 */
export async function notifyHomeroomTeachersOfCompletion({
  actorUserId,
  sbAdmin,
  sessionId,
  wsId,
}: {
  actorUserId: string | null;
  sbAdmin: TypedSupabaseClient;
  sessionId: string;
  wsId: string;
}) {
  const { data: session, error: sessionError } = await sbAdmin
    .schema('private')
    .from('workspace_tutoring_sessions')
    .select('id,group_id,student_user_id,attendance_status,session_date')
    .eq('id', sessionId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (session?.attendance_status !== 'DONE') return 0;

  const { data: teachers, error: teachersError } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('user_id')
    .eq('group_id', session.group_id)
    .eq('role', 'TEACHER');
  if (teachersError) throw teachersError;
  const teacherIds = (teachers ?? []).map((row) => row.user_id);
  if (teacherIds.length === 0) return 0;

  const { data: links, error: linksError } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('platform_user_id')
    .eq('ws_id', wsId)
    .in('virtual_user_id', teacherIds);
  if (linksError) throw linksError;
  // The tutor does not need a notice of their own completion.
  const recipients = [
    ...new Set((links ?? []).map((row) => row.platform_user_id)),
  ].filter((userId) => userId !== actorUserId);
  if (recipients.length === 0) return 0;

  const { data: existing, error: existingError } = await sbAdmin
    .from('notifications')
    .select('user_id')
    .eq('entity_type', TUTORING_SESSION_ENTITY)
    .eq('entity_id', session.id)
    .eq('code', TUTORING_COMPLETED_CODE)
    .in('user_id', recipients);
  if (existingError) throw existingError;
  const notified = new Set((existing ?? []).map((row) => row.user_id));
  const pending = recipients.filter((userId) => !notified.has(userId));
  if (pending.length === 0) return 0;

  const [groupResult, studentResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('name')
      .eq('id', session.group_id)
      .maybeSingle(),
    sbAdmin
      .from('workspace_users')
      .select('full_name,display_name,email')
      .eq('id', session.student_user_id)
      .maybeSingle(),
  ]);
  const groupName = groupResult.data?.name?.trim() || 'their class';
  const studentName = nameOf(studentResult.data);

  let sent = 0;
  for (const userId of pending) {
    // Stored English text is the fallback; apps that ship the code's keys
    // render it in the viewer's language.
    const { error } = await sbAdmin.rpc('create_notification', {
      p_ws_id: wsId,
      p_user_id: userId,
      p_type: 'system_announcement',
      p_code: TUTORING_COMPLETED_CODE,
      p_title: 'Tutoring session completed',
      p_description: `${studentName} (${groupName}) completed a tutoring session on ${session.session_date}.`,
      p_data: {
        groupId: session.group_id,
        sessionDate: session.session_date,
        sessionId: session.id,
        studentUserId: session.student_user_id,
      },
      p_entity_type: TUTORING_SESSION_ENTITY,
      p_entity_id: session.id,
      p_created_by: actorUserId ?? undefined,
      p_scope: 'workspace',
      p_priority: 'medium',
    });
    if (error) {
      console.error('Failed to notify homeroom teacher of tutoring', {
        error,
        sessionId,
        wsId,
      });
      continue;
    }
    sent += 1;
  }
  return sent;
}

/**
 * Completion must never wait on or fail because of the notice: errors are
 * logged and a slow notice is abandoned after a short bound.
 */
export async function notifyCompletionSafely(
  input: Parameters<typeof notifyHomeroomTeachersOfCompletion>[0]
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = notifyHomeroomTeachersOfCompletion(input).catch(
    (error: unknown) => {
      console.error('Failed to send tutoring completion notifications', {
        error,
        sessionId: input.sessionId,
        wsId: input.wsId,
      });
    }
  );
  await Promise.race([
    work,
    new Promise((resolve) => {
      timer = setTimeout(resolve, NOTIFY_TIMEOUT_MS);
    }),
  ]);
  if (timer) clearTimeout(timer);
}
