import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import type { CalendarOAuthProvider } from './calendar-oauth-state';

export type CalendarOAuthNonceConsumption =
  | 'consumed'
  | 'replayed'
  | 'unavailable';

const KEY_PREFIX = 'calendar:oauth-state:v1';
const MAX_LOCAL_ENTRIES = 10_000;

// Process-local fallback for environments without Upstash (local development
// and tests). Production uses Redis so replay protection spans instances.
const locallyConsumed = new Map<string, number>();

function consumeLocally(key: string, expiresAt: number, now: number) {
  for (const [entry, entryExpiresAt] of locallyConsumed) {
    if (entryExpiresAt <= now) locallyConsumed.delete(entry);
  }

  if (locallyConsumed.has(key)) return 'replayed' as const;
  if (locallyConsumed.size >= MAX_LOCAL_ENTRIES) return 'unavailable' as const;

  locallyConsumed.set(key, expiresAt);
  return 'consumed' as const;
}

/**
 * Atomically mark an OAuth state nonce as used. Returns `replayed` when the
 * nonce was already consumed and `unavailable` when the store cannot answer;
 * callers must reject both.
 */
export async function consumeCalendarOAuthNonce({
  expiresAt,
  nonce,
  now = Date.now(),
  provider,
}: {
  expiresAt: number;
  nonce: string;
  now?: number;
  provider: CalendarOAuthProvider;
}): Promise<CalendarOAuthNonceConsumption> {
  const key = `${KEY_PREFIX}:${provider}:${nonce}`;
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));

  try {
    const redis = await getUpstashRestRedisClient();
    if (!redis) return consumeLocally(key, expiresAt, now);

    const result = await redis.set(key, '1', { ex: ttlSeconds, nx: true });
    return result === 'OK' ? 'consumed' : 'replayed';
  } catch (error) {
    console.error('Failed to record calendar OAuth state use', {
      error: error instanceof Error ? error.message : 'Unknown error',
      provider,
    });
    return 'unavailable';
  }
}

export function resetLocalCalendarOAuthNonceStoreForTests() {
  locallyConsumed.clear();
}
