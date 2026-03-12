import type { Session, SupabaseClient } from '@supabase/supabase-js';

export async function applyClientSession<T>(
  client: SupabaseClient<T>,
  session: Session
): Promise<Session> {
  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to switch session: ${error?.message || 'No session returned'}`
    );
  }

  return data.session;
}
