import { createHmac } from 'node:crypto';
import {
  type CalendarOAuthNonceClient,
  consumeCalendarOAuthNonce,
} from './calendar-oauth-nonce-store';

export const CONSENT_RESTART_WINDOW_MS = 10 * 60_000;

type ConsentRestartAdmission =
  | { kind: 'allowed' }
  | { kind: 'limited' | 'unavailable'; retryAfterSeconds: number };

/** One automatic consent restart per account in each ten-minute window. */
export async function admitGoogleConsentRestart(args: {
  userId: string;
  wsId: string;
  account: string;
  clientSecret: string;
  client?: CalendarOAuthNonceClient;
  now?: number;
}): Promise<ConsentRestartAdmission> {
  const now = args.now ?? Date.now();
  const window = Math.floor(now / CONSENT_RESTART_WINDOW_MS);
  const expiresAt = (window + 1) * CONSENT_RESTART_WINDOW_MS;
  // Purpose separation prevents a signed-state nonce from spending this slot.
  // HMAC keeps provider account identities out of the nonce ledger.
  const nonce = createHmac('sha256', args.clientSecret)
    .update(
      JSON.stringify([
        'calendar-consent-restart-v1',
        args.userId,
        args.wsId,
        args.account,
        window,
      ])
    )
    .digest('hex');
  const consumed = await consumeCalendarOAuthNonce({
    client: args.client,
    expiresAt,
    nonce,
    provider: 'google',
    userId: args.userId,
  });
  if (consumed === 'consumed') return { kind: 'allowed' };
  return {
    kind: consumed === 'replayed' ? 'limited' : 'unavailable',
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
  };
}
