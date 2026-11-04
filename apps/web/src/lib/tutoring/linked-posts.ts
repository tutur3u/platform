import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TutoringClassPost } from '@tuturuuu/utils/tutoring-lesson-content';

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Class posts (daily reports) that may report on a missed lesson between
 * `first` and `last`, keyed by group. Rejected posts never count; pending ones
 * do, as in the queue draft. Callers gate this on `view_user_groups_posts`.
 * Posts have no workspace column: the group ids come from workspace-scoped
 * tutoring sessions, which bounds them.
 */
export async function loadLinkedClassPosts({
  first,
  groupIds,
  last,
  sbAdmin,
}: {
  first: string;
  groupIds: string[];
  last: string;
  sbAdmin: TypedSupabaseClient;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('group_id,title,content,created_at')
    .in('group_id', groupIds)
    .neq('post_approval_status', 'REJECTED')
    .gte('created_at', shiftIsoDate(first, -1))
    .lt('created_at', shiftIsoDate(last, 3));
  if (error) throw error;
  const byGroup = new Map<string, TutoringClassPost[]>();
  for (const row of data ?? []) {
    byGroup.set(row.group_id, [
      ...(byGroup.get(row.group_id) ?? []),
      { content: row.content, createdAt: row.created_at, title: row.title },
    ]);
  }
  return byGroup;
}
