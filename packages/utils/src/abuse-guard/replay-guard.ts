/**
 * Process-local protections in front of the store's replay fences. They apply
 * only once the `replay` family is assigned; the legacy path is unchanged.
 *
 * - A known replayed token is answered from memory until it expires, so a
 *   repeated replay costs no store operation.
 * - A per-instance pre-limit per principal and per IP bounds how fast one
 *   caller can spend the family's daily budget.
 *
 * These are shortcuts. Durable source/principal command quotas are enforced
 * by GuardControl before the shared family allowance is spent.
 */
import { createExpiringMap, createLocalWindowLimiter } from './local-cache';
import { isAbuseGuardFamilyAssigned } from './select';

export const REPLAY_PRE_LIMITS = {
  principalPerMinute: 20,
  ipPerMinute: 60,
} as const;

const knownReplays = createExpiringMap<true>();
const preLimiter = createLocalWindowLimiter();

function active() {
  return isAbuseGuardFamilyAssigned('replay');
}

/** Whether this fence key was already seen replayed by this instance. */
export function isKnownReplay(key: string, now = Date.now()) {
  return active() && knownReplays.get(key, now) === true;
}

/** Remembers a replayed fence key until its token expires. */
export function rememberReplay(key: string, expiresAtSeconds: number) {
  if (!active()) return;
  knownReplays.set(key, true, expiresAtSeconds * 1000);
}

/**
 * Charges one replay-fence attempt for a principal and source IP in this
 * instance. Returns Retry-After seconds when over the pre-limit, else null.
 */
export function preLimitReplayAttempt(
  principal: string,
  ip: string | null | undefined,
  now = Date.now()
) {
  if (!active()) return null;
  const denied = preLimiter.hit(
    [
      {
        key: `principal:${principal}`,
        limit: REPLAY_PRE_LIMITS.principalPerMinute,
        windowMs: 60_000,
      },
      ...(ip && ip !== 'unknown'
        ? [
            {
              key: `ip:${ip}`,
              limit: REPLAY_PRE_LIMITS.ipPerMinute,
              windowMs: 60_000,
            },
          ]
        : []),
    ],
    now
  );
  return denied ? Math.max(1, Math.ceil((denied.resetAt - now) / 1000)) : null;
}
