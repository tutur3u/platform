import type { TypedSupabaseClient } from '@tuturuuu/supabase';

/**
 * A time tracking request's `linked_session_id` is updated in place when the
 * request is approved, so it must reference a session that belongs to the same
 * workspace and to the user who files the request.
 */
export async function validateLinkedSession({
  client,
  sessionId,
  userId,
  wsId,
}: {
  client: TypedSupabaseClient;
  sessionId: string | null | undefined;
  userId: string;
  wsId: string;
}): Promise<{ message: string; status: 400 | 500 } | null> {
  if (!sessionId) return null;
  const { data, error } = await client
    .from('time_tracking_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error)
    return { message: 'Failed to validate linked session', status: 500 };
  if (!data) return { message: 'Invalid linked session', status: 400 };
  return null;
}
