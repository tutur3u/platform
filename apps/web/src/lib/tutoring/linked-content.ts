import {
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getMissedLessonContent,
  type TutoringLessonNoteSession,
} from '@tuturuuu/utils/tutoring-lesson-content';

/** The tutoring-session fields that decide whether content is still linked. */
export interface LinkableTutoringSession {
  id: string;
  group_id: string;
  student_user_id: string;
  reason_type: string;
  attendance_status: string;
  content: string;
  session_date: string;
  start_time: string;
}

const ABSENT_STATUSES = ['ABSENT', 'Absent', 'absent'];

/**
 * A pending make-up session with no stored content follows the missed class's
 * lesson notes. Completion stores the notes; a staff edit stores its own text.
 */
export function isLinkedContentSession(session: LinkableTutoringSession) {
  return (
    session.reason_type === 'ABSENT_RECOVERY' &&
    session.attendance_status === 'PENDING' &&
    session.content.trim() === ''
  );
}

/**
 * Pairs make-up sessions with absences using the queue's legacy matching rule:
 * chronologically, each session covers the oldest uncovered absence on or
 * before its date.
 */
export function pairSessionsWithAbsences(
  absenceDates: string[],
  sessions: Pick<
    LinkableTutoringSession,
    'id' | 'session_date' | 'start_time'
  >[]
) {
  const absences = [...absenceDates].sort();
  const ordered = [...sessions].sort(
    (a, b) =>
      a.session_date.localeCompare(b.session_date) ||
      a.start_time.localeCompare(b.start_time) ||
      a.id.localeCompare(b.id)
  );
  const paired = new Map<string, string>();
  let consumed = 0;
  for (const session of ordered) {
    const next = absences[consumed];
    if (next === undefined || next > session.session_date) continue;
    paired.set(session.id, next);
    consumed += 1;
  }
  return paired;
}

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Reads the current lesson notes for each linked session's missed class.
 * Sessions that are not linked are skipped; a linked session without recorded
 * notes resolves to an empty string.
 */
export async function loadLinkedLessonContent({
  sbAdmin,
  sessions,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  sessions: LinkableTutoringSession[];
  wsId: string;
}) {
  const result = new Map<string, string>();
  const targets = sessions.filter(isLinkedContentSession);
  if (targets.length === 0) return result;

  const groupIds = [...new Set(targets.map((session) => session.group_id))];
  const studentIds = [
    ...new Set(targets.map((session) => session.student_user_id)),
  ];
  const privateDb = sbAdmin.schema('private');

  const policyResult = await sbAdmin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', wsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);
  if (policyResult.error) throw policyResult.error;
  const policy = readTutoringPolicyConfigRows(policyResult.data ?? []);
  const cutoff = new Date(Date.now() - policy.absenceLookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [attendanceResult, reservationResult] = await Promise.all([
    sbAdmin
      .from('user_group_attendance')
      .select('group_id,user_id,date')
      .in('group_id', groupIds)
      .in('user_id', studentIds)
      .in('status', ABSENT_STATUSES)
      .gte('date', cutoff),
    privateDb
      .from('workspace_tutoring_sessions')
      .select('id,group_id,student_user_id,session_date,start_time')
      .eq('ws_id', wsId)
      .eq('reason_type', 'ABSENT_RECOVERY')
      .in('attendance_status', ['DONE', 'PENDING'])
      .in('group_id', groupIds)
      .in('student_user_id', studentIds)
      .gte('session_date', cutoff),
  ]);
  if (attendanceResult.error) throw attendanceResult.error;
  if (reservationResult.error) throw reservationResult.error;

  const absencesByKey = new Map<string, string[]>();
  for (const row of attendanceResult.data ?? []) {
    const key = `${row.group_id}:${row.user_id}`;
    absencesByKey.set(key, [...(absencesByKey.get(key) ?? []), row.date]);
  }
  const reservationsByKey = new Map<
    string,
    { id: string; session_date: string; start_time: string }[]
  >();
  for (const row of reservationResult.data ?? []) {
    const key = `${row.group_id}:${row.student_user_id}`;
    reservationsByKey.set(key, [...(reservationsByKey.get(key) ?? []), row]);
  }

  const missedDateBySession = new Map<string, string>();
  for (const [key, reservations] of reservationsByKey) {
    const pairs = pairSessionsWithAbsences(
      absencesByKey.get(key) ?? [],
      reservations
    );
    for (const [sessionId, date] of pairs) {
      missedDateBySession.set(sessionId, date);
    }
  }

  const missedDates = targets
    .map((session) => missedDateBySession.get(session.id))
    .filter((date): date is string => Boolean(date))
    .sort();
  const first = missedDates[0];
  const last = missedDates.at(-1);
  if (!first || !last) {
    for (const session of targets) result.set(session.id, '');
    return result;
  }

  // Class sessions are timestamped; widen by a day for timezone offsets and let
  // the local-date match decide.
  const lessonsResult = await privateDb
    .from('workspace_user_group_sessions')
    .select(
      'group_id,status,starts_at,start_timezone,recurrence_instance_date,description,description_json'
    )
    .eq('ws_id', wsId)
    .in('group_id', groupIds)
    .eq('status', 'scheduled')
    .gte('starts_at', shiftIsoDate(first, -1))
    .lt('starts_at', shiftIsoDate(last, 2));
  if (lessonsResult.error) throw lessonsResult.error;

  const lessonsByGroup = new Map<string, TutoringLessonNoteSession[]>();
  for (const row of lessonsResult.data ?? []) {
    lessonsByGroup.set(row.group_id, [
      ...(lessonsByGroup.get(row.group_id) ?? []),
      {
        description: row.description,
        descriptionJson:
          row.description_json as TutoringLessonNoteSession['descriptionJson'],
        recurrenceInstanceDate: row.recurrence_instance_date,
        startTimezone: row.start_timezone,
        startsAt: row.starts_at,
        status: row.status as TutoringLessonNoteSession['status'],
      },
    ]);
  }

  for (const session of targets) {
    const date = missedDateBySession.get(session.id);
    result.set(
      session.id,
      date
        ? getMissedLessonContent(lessonsByGroup.get(session.group_id) ?? [], [
            date,
          ])
        : ''
    );
  }
  return result;
}

/**
 * Stores the linked lesson notes when a make-up session is completed. The
 * write only lands while the content is still blank (empty or whitespace, as
 * the listing treats it), so a staff edit made in
 * the meantime is never overwritten. Failures are logged, never thrown:
 * completion must not depend on the notes lookup.
 */
export async function freezeLinkedLessonContent({
  sbAdmin,
  sessionId,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  sessionId: string;
  wsId: string;
}) {
  try {
    const privateDb = sbAdmin.schema('private');
    const { data: session, error } = await privateDb
      .from('workspace_tutoring_sessions')
      .select(
        'id,group_id,student_user_id,reason_type,attendance_status,content,session_date,start_time'
      )
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) throw error;
    // Same rule as the listing: blank content is linked, real text is a
    // manual edit that must never be overwritten.
    if (session?.content.trim() !== '') return;

    // Derive as if still pending: the notes as they stood at completion.
    const linked = await loadLinkedLessonContent({
      sbAdmin,
      sessions: [{ ...session, attendance_status: 'PENDING' }],
      wsId,
    });
    const content = linked.get(session.id);
    if (!content) return;

    const { error: updateError } = await privateDb
      .from('workspace_tutoring_sessions')
      .update({ content })
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('attendance_status', 'DONE')
      // Compare-and-set on the blank value read above, whitespace included,
      // so a staff edit made in the meantime is left alone.
      .eq('content', session.content);
    if (updateError) throw updateError;
  } catch (error) {
    console.error('Failed to store linked tutoring lesson content', {
      error,
      sessionId,
      wsId,
    });
  }
}
