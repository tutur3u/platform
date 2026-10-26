import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export interface ReconnectedCredential {
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  account_name?: string | null;
}

const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703']);

/**
 * Reactivates an existing account row after a successful OAuth reconnect.
 * Clears the sync quarantine fields in the same statement, and rewrites
 * created_at so any in-flight quarantine of the old credential is fenced.
 */
export async function reactivateCalendarAuthToken(
  supabase: TypedSupabaseClient,
  tokenId: string,
  credential: ReconnectedCredential
) {
  const fields = {
    ...credential,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  const result = await supabase
    .from('calendar_auth_tokens')
    .update({ ...fields, deactivated_reason: null, deactivated_at: null })
    .eq('id', tokenId);
  if (!result.error || !MISSING_COLUMN_CODES.has(result.error.code))
    return result;
  // The quarantine columns have not reached this database yet.
  return supabase.from('calendar_auth_tokens').update(fields).eq('id', tokenId);
}
