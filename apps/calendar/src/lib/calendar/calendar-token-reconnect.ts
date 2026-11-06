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
 *
 * `reusedFrom` marks a reconnect that kept the stored refresh token because
 * the provider issued none. That token is only safe if nothing rejected it
 * since the callback read the row, so the update then matches only a row
 * that is still active, unquarantined and unchanged (same created_at).
 * `matched: false` means the guard lost and the caller must ask again with
 * consent instead of reporting success.
 */
export async function reactivateCalendarAuthToken(
  supabase: TypedSupabaseClient,
  tokenId: string,
  credential: ReconnectedCredential,
  reusedFrom?: { createdAt: string }
): Promise<{ error: { code?: string } | null; matched: boolean }> {
  const fields = {
    ...credential,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  const write = async (withQuarantineColumns: boolean) => {
    let query = supabase
      .from('calendar_auth_tokens')
      .update(
        withQuarantineColumns
          ? { ...fields, deactivated_reason: null, deactivated_at: null }
          : fields
      )
      .eq('id', tokenId);
    if (reusedFrom) {
      query = query
        .eq('is_active', true)
        .eq('created_at', reusedFrom.createdAt);
      if (withQuarantineColumns) query = query.is('deactivated_reason', null);
    }
    const { data, error } = await query.select('id');
    return { error, matched: !error && (data?.length ?? 0) > 0 };
  };
  const result = await write(true);
  if (!result.error || !MISSING_COLUMN_CODES.has(result.error.code ?? ''))
    return result;
  // The quarantine columns have not reached this database yet.
  return write(false);
}
