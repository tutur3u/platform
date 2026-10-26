import { createHash } from 'node:crypto';
import type { CalendarOAuthReasonCode } from './oauth-failure';
import { reserveQuarantineAttempt } from './oauth-token-health';

export type QuarantineOutcome =
  | 'deactivated'
  | 'already_inactive'
  | 'fenced'
  | 'deactivation_deferred';

export interface QuarantineCandidate {
  id: string;
  ws_id: string;
  refresh_token: string;
  created_at: string;
}

type QuarantineClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

const MISSING_RPC_CODES = new Set(['PGRST202', '42883']);

// Only this hash leaves the process; the database recomputes it in SQL.
export function calendarCredentialFingerprint(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

/**
 * Deactivates a permanently rejected credential unless the owner reconnected
 * after it was read. Never deletes, and never sends a credential in a URL.
 */
export async function quarantineCalendarAuthToken(
  client: QuarantineClient,
  token: QuarantineCandidate,
  reason: CalendarOAuthReasonCode
): Promise<QuarantineOutcome> {
  if (!reserveQuarantineAttempt()) return 'deactivation_deferred';

  if (client.rpc) {
    const { data, error } = await client.rpc('quarantine_calendar_auth_token', {
      p_token_id: token.id,
      p_ws_id: token.ws_id,
      p_credential_fingerprint: calendarCredentialFingerprint(
        token.refresh_token
      ),
      p_observed_created_at: token.created_at,
      p_reason: reason,
    });
    if (!error) {
      if (
        data === 'deactivated' ||
        data === 'already_inactive' ||
        data === 'fenced'
      )
        return data;
      throw new Error('Unexpected calendar credential quarantine result');
    }
    if (!MISSING_RPC_CODES.has(error.code))
      throw new Error('Calendar credential quarantine failed');
  }

  // Schema pending: the migration has not reached this database yet. Fence
  // on row metadata only; the reconnect callback always rewrites created_at.
  console.warn('calendar.oauth.quarantine_schema_pending');
  const { data, error } = await client
    .from('calendar_auth_tokens')
    .update({ is_active: false })
    .eq('id', token.id)
    .eq('ws_id', token.ws_id)
    .eq('is_active', true)
    .eq('created_at', token.created_at)
    .select('id');
  if (error) throw new Error('Calendar credential quarantine failed');
  return Array.isArray(data) && data.length > 0 ? 'deactivated' : 'fenced';
}
