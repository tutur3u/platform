import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';

type CheckWrite = Pick<
  Database['private']['Tables']['user_group_post_checks']['Insert'],
  'post_id' | 'user_id' | 'is_completed'
> &
  Partial<
    Pick<
      Database['private']['Tables']['user_group_post_checks']['Insert'],
      'notes'
    >
  >;

export async function upsertPostChecks(
  client: TypedSupabaseClient,
  checks: CheckWrite[]
) {
  // PostgREST uses the union of batch columns. Keep omitted notes out of that
  // union so completion-only writes never replace an existing note with null.
  const completionOnly = checks
    .filter((check) => check.notes === undefined)
    .map(({ post_id, user_id, is_completed }) => ({
      post_id,
      user_id,
      is_completed,
    }));
  const withNotes = checks.filter((check) => check.notes !== undefined);

  for (const batch of [completionOnly, withNotes]) {
    if (batch.length === 0) continue;
    const { error } = await client
      .schema('private')
      .from('user_group_post_checks')
      .upsert(batch, { onConflict: 'post_id,user_id' });
    if (error) return { error };
  }
  return { error: null };
}
