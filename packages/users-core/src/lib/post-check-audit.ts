import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const LOG_TABLE = 'user_group_post_check_logs';

export type PostCheckState = boolean | null;

export interface PostCheckChange {
  user_id: string;
  previous_is_completed: PostCheckState;
  new_is_completed: PostCheckState;
}

export interface PostCheckLogEntry {
  id: string;
  post_id: string;
  user_id: string;
  previous_is_completed: PostCheckState;
  new_is_completed: PostCheckState;
  changed_by: string | null;
  created_at: string;
}

type PrivateSchema = { from: (table: string) => any };

function privateSchema(sbAdmin: TypedSupabaseClient): PrivateSchema {
  return (sbAdmin as any).schema('private');
}

export async function getExistingPostCheckStates(
  sbAdmin: TypedSupabaseClient,
  postId: string,
  userIds: string[]
): Promise<Map<string, PostCheckState>> {
  const states = new Map<string, PostCheckState>();
  if (userIds.length === 0) return states;

  const { data } = await privateSchema(sbAdmin)
    .from('user_group_post_checks')
    .select('user_id, is_completed')
    .eq('post_id', postId)
    .in('user_id', userIds);

  for (const row of (data ?? []) as Array<{
    user_id: string;
    is_completed: boolean;
  }>) {
    states.set(row.user_id, row.is_completed);
  }

  return states;
}

export async function recordPostCheckChanges(
  sbAdmin: TypedSupabaseClient,
  {
    postId,
    changedBy,
    changes,
  }: {
    postId: string;
    changedBy: string | null;
    changes: PostCheckChange[];
  }
): Promise<void> {
  const rows = changes
    .filter(
      (change) => change.previous_is_completed !== change.new_is_completed
    )
    .map((change) => ({
      changed_by: changedBy,
      new_is_completed: change.new_is_completed,
      post_id: postId,
      previous_is_completed: change.previous_is_completed,
      user_id: change.user_id,
    }));

  if (rows.length === 0) return;

  const { error } = await privateSchema(sbAdmin).from(LOG_TABLE).insert(rows);
  if (error) {
    console.error('[post-check-audit] Failed to record completion changes', {
      error,
      postId,
      rowCount: rows.length,
    });
  }
}

export async function listPostCheckLogs(
  sbAdmin: TypedSupabaseClient,
  postId: string,
  { userId, limit = 200 }: { userId?: string; limit?: number } = {}
): Promise<PostCheckLogEntry[]> {
  let query = privateSchema(sbAdmin)
    .from(LOG_TABLE)
    .select(
      'id, post_id, user_id, previous_is_completed, new_is_completed, changed_by, created_at'
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PostCheckLogEntry[];
}
