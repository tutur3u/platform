import { createHash } from 'node:crypto';
import type { CalendarOAuthReasonCode } from './oauth-failure';
import { consensusBreaker } from './oauth-token-health';

export type QuarantineOutcome =
  | 'deactivated'
  | 'already_inactive'
  | 'fenced'
  // Not written: the schema or the breaker history could not be read.
  | 'deactivation_deferred'
  // Not written: too many accounts failed the same way, which may point at
  // our OAuth client or the provider. The account stays active and alerts.
  | 'consensus_hold';

export interface QuarantineCandidate {
  id: string;
  ws_id: string;
  refresh_token: string;
  created_at: string;
  user_id?: string;
  provider?: string;
}

// Method syntax keeps parameters bivariant, so the typed Supabase client,
// whose rpc accepts only known function names, is assignable.
type QuarantineClient = {
  from(table: string): any;
  rpc?(fn: string, args: Record<string, unknown>): any;
};

// Distinct accounts failing with one reason, in this run plus the recent
// window, at which quarantine holds instead of writing. The window counts rows
// still quarantined: a reconnect clears its row and frees a slot, which is
// fine because a working reconnect shows the client is healthy.
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
  if (recent + arrival >= CONSENSUS_ACCOUNTS) return 'consensus_hold';
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
  if (data === 'deactivated')
    await notifyReconnectRequired(client, token, reason);
  if (
    data === 'deactivated' ||
    data === 'already_inactive' ||
    data === 'fenced'
  )
    return data;
  throw new Error('Unexpected calendar credential quarantine result');
}

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

// Tells the owner once, through the existing notification preferences and
// channels. The quarantine fence makes 'deactivated' happen once per
// credential, so this never repeats for the same rejection.
async function notifyReconnectRequired(
  client: QuarantineClient,
  token: QuarantineCandidate,
  reason: CalendarOAuthReasonCode
) {
  if (!client.rpc || !token.user_id) return;
  const provider = PROVIDER_NAMES[token.provider ?? ''] ?? 'Calendar';
  try {
    const { error } = await client.rpc('create_notification', {
      p_ws_id: token.ws_id,
      p_user_id: token.user_id,
      p_type: 'account_update',
      p_code: 'calendar_reconnect_required',
      p_title: 'Reconnect your calendar',
      p_description: `${provider} stopped accepting access, so calendar sync paused. Reconnect the account to resume.`,
      p_data: { provider: token.provider ?? null, reason },
      p_entity_type: 'calendar_auth_token',
      p_entity_id: token.id,
      p_scope: 'workspace',
      p_priority: 'high',
    });
    if (error)
      console.warn('calendar.oauth.reconnect_notification_failed', {
        code: error.code,
      });
  } catch {
    console.warn('calendar.oauth.reconnect_notification_failed');
  }
}
