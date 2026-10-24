import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit';

// The proxy exempts trusted CLI identities from its general limit, so the
// endpoints that a stuck or looping client could hammer get their own
// per-actor budgets. A 429 is a definite rejection: the CLI queues locally.
export const DEVBOX_KEYED_CREATE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 30,
};
export const DEVBOX_STOP_BY_KEY_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 30,
};

export function limitDevboxKeyedCreate(actorId: string) {
  return checkRateLimit(
    `devbox:runs:keyed-create:${actorId}`,
    DEVBOX_KEYED_CREATE_RATE_LIMIT
  );
}

export function limitDevboxStopByKey(actorId: string) {
  return checkRateLimit(
    `devbox:runs:stop-by-key:${actorId}`,
    DEVBOX_STOP_BY_KEY_RATE_LIMIT
  );
}
