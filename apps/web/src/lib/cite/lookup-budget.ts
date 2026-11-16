import 'server-only';

import { createHash } from 'node:crypto';
import { normalizeClientIp } from '@tuturuuu/utils/abuse-protection/client-ip';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';

export const LOOKUP_IP_LIMIT = 10;
export const LOOKUP_GLOBAL_LIMIT = 120;

// Both counters are admitted atomically across all server instances.
const reserve = `
local ip = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if ip >= tonumber(ARGV[1]) or total >= tonumber(ARGV[2]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1`;

type BudgetStore = {
  eval: (
    script: string,
    keys: string[],
    args: (string | number)[]
  ) => Promise<unknown>;
};
type BudgetResult =
  | { kind: 'allowed' }
  | { kind: 'rejected'; status: 429 | 503; retryAfter: number };

/** Anonymous lookups require Cloudflare's client IP; other forwarding headers are ignored. */
export async function reserveCitationLookup(
  headers: Headers,
  dependencies: {
    store?: () => Promise<BudgetStore | null>;
    now?: () => number;
  } = {}
): Promise<BudgetResult> {
  const ip = normalizeClientIp(headers.get('cf-connecting-ip'));
  if (!ip) return { kind: 'rejected', status: 429, retryAfter: 60 };
  const now = (dependencies.now ?? Date.now)();
  const minute = Math.floor(now / 60_000);
  const retryAfter = Math.max(1, 60 - Math.floor((now % 60_000) / 1000));
  const actor = createHash('sha256').update(ip).digest('hex');
  try {
    const store = await (dependencies.store ?? getUpstashRestRedisClient)();
    if (!store) return { kind: 'rejected', status: 503, retryAfter: 60 };
    const admitted = await store.eval(
      reserve,
      [
        `cite:lookup:{budget}:${minute}:ip:${actor}`,
        `cite:lookup:{budget}:${minute}:global`,
      ],
      [LOOKUP_IP_LIMIT, LOOKUP_GLOBAL_LIMIT, 120]
    );
    return admitted === 1
      ? { kind: 'allowed' }
      : { kind: 'rejected', status: 429, retryAfter };
  } catch {
    console.warn('cite_lookup_budget_unavailable');
    return { kind: 'rejected', status: 503, retryAfter: 60 };
  }
}
