import { createHash } from 'node:crypto';
import type { CalendarOAuthReasonCode } from './oauth-failure';
import { consensusBreaker } from './oauth-token-health';

export type QuarantineOutcome =
  | 'deactivated'
  | 'already_inactive'
  | 'fenced'
  // Not written: the schema or the breaker history could not be read.
  | 'deactivation_deferred'
  // Not written: too many accounts failed the same way, which points at our
  // OAuth client or the provider rather than at this account.
  | 'systemic';

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

// Distinct accounts failing with one reason, in this run plus the recent
// window, at which quarantine stops and the failure is treated as systemic.
export const CONSENSUS_ACCOUNTS = 3;
export const CONSENSUS_WINDOW_MS = 24 * 60 * 60 * 1000;

const MISSING_SCHEMA_CODES = new Set([
  'PGRST202',
  'PGRST204',
  '42703',
  '42883',
]);

// Only this hash leaves the process; the database recomputes it in SQL.
export function calendarCredentialFingerprint(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

// Quarantines already written for this reason inside the window, read from
// the quarantine columns themselves. Null when that history is unreadable.
async function recentQuarantines(
  client: QuarantineClient,
  reason: CalendarOAuthReasonCode
): Promise<number | null> {
  const { data, error } = await client
    .from('calendar_auth_tokens')
    .select('id')
    .eq('deactivated_reason', reason)
    .gte(
      'deactivated_at',
      new Date(Date.now() - CONSENSUS_WINDOW_MS).toISOString()
    )
    .limit(CONSENSUS_ACCOUNTS);
  if (error) return null;
  return Array.isArray(data) ? data.length : 0;
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
  const breaker = consensusBreaker(reason);
  if (!breaker.accounts.has(token.id))
    breaker.accounts.set(token.id, breaker.accounts.size + 1);
  const arrival = breaker.accounts.get(token.id) ?? breaker.accounts.size;
  breaker.recent ??= recentQuarantines(client, reason);
  const recent = await breaker.recent;
  if (recent === null) return 'deactivation_deferred';
  if (recent + arrival >= CONSENSUS_ACCOUNTS) return 'systemic';
  if (!client.rpc) return 'deactivation_deferred';

  const { data, error } = await client.rpc('quarantine_calendar_auth_token', {
    p_token_id: token.id,
    p_ws_id: token.ws_id,
    p_credential_fingerprint: calendarCredentialFingerprint(
      token.refresh_token
    ),
    p_observed_created_at: token.created_at,
    p_reason: reason,
  });
  if (error) {
    if (MISSING_SCHEMA_CODES.has(error.code)) return 'deactivation_deferred';
    throw new Error('Calendar credential quarantine failed');
  }
  if (
    data === 'deactivated' ||
    data === 'already_inactive' ||
    data === 'fenced'
  )
    return data;
  throw new Error('Unexpected calendar credential quarantine result');
}
