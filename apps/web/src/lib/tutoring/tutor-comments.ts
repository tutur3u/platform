import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function tutorCommentsEnabled(wsId: string) {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', wsId)
    .eq('id', 'tutoring_tutor_comments')
    .maybeSingle();
  return !error && data?.value?.trim().toLowerCase() === 'true';
}
