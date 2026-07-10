import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

/**
 * Audit helpers for `private.user_group_post_checks`.
 *
 * A completion "check" for a member can be pending (no row / `null`), completed
 * (`true`) or incomplete (`false`). Every transition is recorded in
 * `private.user_group_post_check_logs` so history is traceable and individual
 * entries can be reverted (e.g. after an accidental "check all").
 *
 * The log table is app-gated (service role); its generated types are not yet
 * available, so writes/reads are cast at the client boundary here rather than
 * hand-editing generated type files.
 */

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

/** Current completion state for the given members of a post. */
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

/** Persist audit rows for the transitions that actually changed. */
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
    .filter((c) => c.previous_is_completed !== c.new_is_completed)
    .map((c) => ({
      post_id: postId,
      user_id: c.user_id,
      previous_is_completed: c.previous_is_completed,
      new_is_completed: c.new_is_completed,
      changed_by: changedBy,
    }));

  if (rows.length === 0) return;

  const { error } = await privateSchema(sbAdmin).from(LOG_TABLE).insert(rows);
  if (error) {
    // Auditing must never block the primary write; surface for observability.
    console.error(
      `[post-check-audit] Failed to record ${rows.length} log row(s) for post ${postId}:`,
      error.message || error
    );
  }
}

/** History for a post, newest first, optionally scoped to one member. */
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

  const { data } = await query;
  return (data ?? []) as PostCheckLogEntry[];
}
