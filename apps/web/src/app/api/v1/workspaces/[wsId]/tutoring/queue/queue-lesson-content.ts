import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getMissedClassNotes,
  type MissedClassNotes,
  type TutoringClassPost,
  type TutoringLessonNoteSession,
} from '@tuturuuu/utils/tutoring-lesson-content';

/** Used only when a group has no class session to read its time zone from. */
const FALLBACK_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Upper bound per query. A full result may be truncated, which would turn into
 * false "no lesson notes" claims, so it fails the lookup instead and the
 * client falls back to reading the class sessions itself.
 */
const LESSON_ROW_LIMIT = 1000;

interface QueueLessonTarget {
  group_id: string;
  student_user_id: string;
  missed_class_dates: string[];
}

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Reads the class session notes and, when allowed, the class posts for each
 * queue row's missed dates in two queries, so the list does not fan out a
 * request per row. Keyed `groupId:studentId`. Posts have no workspace column:
 * the group ids come from the workspace-scoped queue, which bounds them.
 */
export async function loadQueueLessonNotes({
  includePosts,
  sbAdmin,
  targets,
  wsId,
}: {
  includePosts: boolean;
  sbAdmin: TypedSupabaseClient;
  targets: QueueLessonTarget[];
  wsId: string;
}) {
  const result = new Map<string, MissedClassNotes>();
  const withDates = targets.filter((item) => item.missed_class_dates.length);
  if (withDates.length === 0) return result;

  const groupIds = [...new Set(withDates.map((item) => item.group_id))];
  const dates = withDates.flatMap((item) => item.missed_class_dates).sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return result;

  // Class sessions are timestamped; widen by a day for timezone offsets and let
  // the local-date match decide.
  const privateDb = sbAdmin.schema('private');
  const [lessonsResult, postsResult] = await Promise.all([
    privateDb
      .from('workspace_user_group_sessions')
      .select(
        'group_id,status,starts_at,start_timezone,recurrence_instance_date,description,description_json'
      )
      .eq('ws_id', wsId)
      .in('group_id', groupIds)
      .eq('status', 'scheduled')
      .gte('starts_at', shiftIsoDate(first, -1))
      .lt('starts_at', shiftIsoDate(last, 2))
      .limit(LESSON_ROW_LIMIT),
    includePosts
      ? privateDb
          .from('user_group_posts')
          .select('group_id,title,content,created_at')
          .in('group_id', groupIds)
          .neq('post_approval_status', 'REJECTED')
          .gte('created_at', shiftIsoDate(first, -1))
          .lt('created_at', shiftIsoDate(last, 2))
          .order('created_at', { ascending: true })
          .limit(LESSON_ROW_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lessonsResult.error) throw lessonsResult.error;
  if (postsResult.error) throw postsResult.error;
  if (
    (lessonsResult.data?.length ?? 0) >= LESSON_ROW_LIMIT ||
    (postsResult.data?.length ?? 0) >= LESSON_ROW_LIMIT
  ) {
    throw new Error('Tutoring queue lesson content exceeded the row limit');
  }
  const { data } = lessonsResult;

  const lessonsByGroup = new Map<string, TutoringLessonNoteSession[]>();
  for (const row of data ?? []) {
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

  const postsByGroup = new Map<string, TutoringClassPost[]>();
  for (const row of postsResult.data ?? []) {
    postsByGroup.set(row.group_id, [
      ...(postsByGroup.get(row.group_id) ?? []),
      { content: row.content, createdAt: row.created_at, title: row.title },
    ]);
  }

  for (const item of withDates) {
    const lessons = lessonsByGroup.get(item.group_id) ?? [];
    result.set(
      `${item.group_id}:${item.student_user_id}`,
      getMissedClassNotes(
        lessons,
        postsByGroup.get(item.group_id) ?? [],
        item.missed_class_dates,
        lessons[0]?.startTimezone ?? FALLBACK_TIME_ZONE
      )
    );
  }
  return result;
}
