import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * Meeting transcripts and AI notes are readable only by participants of the
 * call and by workspace admins of the meeting's own workspace. The room policy
 * decides participation; this decides the admin half. A lookup failure throws
 * so every caller fails closed.
 */
export async function isMeetingNotesAdmin(input: {
  supabase: Pick<TypedSupabaseClient, 'rpc'>;
  wsId: string;
  userId: string;
}) {
  const { data, error } = await input.supabase.rpc('has_workspace_permission', {
    p_ws_id: input.wsId,
    p_user_id: input.userId,
    p_permission: 'admin',
  });
  if (error) throw new Error('meet_notes_admin_lookup_failed');
  return data === true;
}
