import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TutoringClassPost } from '@tuturuuu/utils/tutoring-lesson-content';

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Upper bound per query. A full result may be truncated, and a truncated list
 * would drop reports from the make-up, so the lookup fails instead: the list
 * keeps the stored content.
 */
export const LINKED_ROW_LIMIT = 1000;

/**
 * Class posts (daily reports) that may report on a missed lesson between
 * `first` and `last`, keyed by group. Rejected posts never count; pending ones
 * do, as in the queue draft. Callers gate this on `view_user_groups_posts`.
 * Posts have no workspace column, so only groups of `wsId` are read.
 */
export async function loadLinkedClassPosts({
  first,
  groupIds,
  last,
  sbAdmin,
  wsId,
}: {
  first: string;
  groupIds: string[];
  last: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const groups = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .in('id', groupIds);
  if (groups.error) throw groups.error;
  const byGroup = new Map<string, TutoringClassPost[]>();
  const scoped = (groups.data ?? []).map((group) => group.id);
  if (scoped.length === 0) return byGroup;

  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('group_id,title,content,created_at')
    .in('group_id', scoped)
    .neq('post_approval_status', 'REJECTED')
    .gte('created_at', shiftIsoDate(first, -1))
    .lt('created_at', shiftIsoDate(last, 3))
    .order('created_at', { ascending: true })
    .limit(LINKED_ROW_LIMIT);
  if (error) throw error;
  if ((data?.length ?? 0) >= LINKED_ROW_LIMIT)
    throw new Error('Linked tutoring class posts exceeded the row limit');
  for (const row of data ?? []) {
    byGroup.set(row.group_id, [
      ...(byGroup.get(row.group_id) ?? []),
      { content: row.content, createdAt: row.created_at, title: row.title },
    ]);
  }
  return byGroup;
}
