import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { CalendarOAuthProvider } from './calendar-oauth-state';

export type CalendarOAuthNonceConsumption =
  | 'consumed'
  | 'replayed'
  | 'unavailable';

type NonceRpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/** Minimal surface of the service-role client used for nonce consumption. */
export type CalendarOAuthNonceClient = {
  schema(schema: 'private'): {
    rpc(
      fn: 'consume_calendar_oauth_state_nonce',
      args: {
        p_expires_at: string;
        p_nonce: string;
        p_provider: CalendarOAuthProvider;
        p_user_id: string;
      }
    ): PromiseLike<NonceRpcResult>;
  };
};

async function defaultClient() {
  return (await createAdminClient({
    noCookie: true,
  })) as unknown as CalendarOAuthNonceClient;
}

/**
 * Atomically mark an OAuth state nonce as used in the private single-use
 * ledger (`private.calendar_oauth_state_nonces`). Returns `replayed` when the
 * nonce was already consumed and `unavailable` when the ledger cannot answer
 * (for example the table or RPC is missing); callers must reject both.
 */
export async function consumeCalendarOAuthNonce({
  client,
  expiresAt,
  nonce,
  provider,
  userId,
}: {
  client?: CalendarOAuthNonceClient;
  expiresAt: number;
  nonce: string;
  provider: CalendarOAuthProvider;
  userId: string;
}): Promise<CalendarOAuthNonceConsumption> {
  try {
    const db = client ?? (await defaultClient());
    const { data, error } = await db
      .schema('private')
      .rpc('consume_calendar_oauth_state_nonce', {
        p_expires_at: new Date(expiresAt).toISOString(),
        p_nonce: nonce,
        p_provider: provider,
        p_user_id: userId,
      });

    if (error) {
      console.error('Failed to record calendar OAuth state use', {
        code: error.code ?? null,
        provider,
      });
      return 'unavailable';
    }

    if (data === true) return 'consumed';
    if (data === false) return 'replayed';

    console.error('Unexpected calendar OAuth state ledger response', {
      provider,
    });
    return 'unavailable';
  } catch (error) {
    console.error('Failed to record calendar OAuth state use', {
      error: error instanceof Error ? error.message : 'Unknown error',
      provider,
    });
    return 'unavailable';
  }
}
