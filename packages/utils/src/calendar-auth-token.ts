import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { WorkspaceCalendarGoogleTokenClient } from '@tuturuuu/types/db';

export const WORKSPACE_CALENDAR_GOOGLE_TOKEN_CLIENT_SELECT =
  'id, ws_id, user_id, provider, account_email, account_name, is_active, expires_at, created_at' as const;

export async function fetchUserWorkspaceCalendarGoogleTokenForClient(
  supabase: TypedSupabaseClient,
  params: { wsId: string; userId: string }
): Promise<WorkspaceCalendarGoogleTokenClient | null> {
  const { data } = await supabase
    .from('calendar_auth_tokens')
    .select(WORKSPACE_CALENDAR_GOOGLE_TOKEN_CLIENT_SELECT)
    .eq('ws_id', params.wsId)
    .eq('user_id', params.userId)
    .maybeSingle();

  return data;
}
