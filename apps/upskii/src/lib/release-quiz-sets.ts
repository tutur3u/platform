// File: lib/releaseQuizSets.ts
import { createClient } from '@tuturuuu/supabase/next/server';

/**
 * Finds all quiz‐sets where:
 *   release_points_immediately = false,
 *   results_released = false,
 *   release_at <= now(),
 * and sets results_released = true.
 */
export default async function releaseQuizSets() {
  const supabase = await createClient();

  // 1) Select all sets that need release
  const { data: toRelease, error: findErr } = await supabase
    .from('workspace_quiz_sets')
    .select('id')
    .eq('release_points_immediately', false)
    .eq('results_released', false)
    .lte('release_at', new Date().toISOString());

  if (findErr) {
    console.error('Error querying quiz‐sets to release:', findErr);
    return { releasedCount: 0, error: findErr.message };
  }
  if (!toRelease || toRelease.length === 0) {
    return { releasedCount: 0 };
  }

  // 2) Update all of them: set results_released = true
  const ids = toRelease.map((row) => row.id);
  const { data: updated, error: updErr } = await supabase
    .from('workspace_quiz_sets')
    .update({ results_released: true })
    .in('id', ids)
    .select('id');

  if (updErr) {
    console.error('Error updating quiz‐sets to release:', updErr);
    return { releasedCount: 0, error: updErr.message };
  }

  return { releasedCount: updated?.length ?? 0 };
}
