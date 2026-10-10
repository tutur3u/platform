/** Portable planning only: adapters must persist reservations before I/O. */
export type RetryBudget = {
  attempts: number;
  nextAt: number;
  expiresAt: number;
};
export type RetryPolicy = {
  maxAttempts: number;
  maxAgeMs: number;
  delayMs: number;
};
export type RetryReservation =
  | { kind: 'stop' }
  | { kind: 'wait'; at: number }
  | { kind: 'reserve'; reservation: RetryBudget };

function timestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Invalid durable state stops rather than replenishing a finite job. */
export function planRetryReservation(
  current: RetryBudget | undefined,
  now: number,
  policy: RetryPolicy
): RetryReservation {
  if (
    !timestamp(now) ||
    !positive(policy.maxAttempts) ||
    !positive(policy.maxAgeMs) ||
    !positive(policy.delayMs)
  )
    return { kind: 'stop' };

  if (
    current !== undefined &&
    (current === null || typeof current !== 'object')
  )
    return { kind: 'stop' };
  const budget =
    current === undefined
      ? {
          attempts: 0,
          nextAt: now,
          expiresAt: now + policy.maxAgeMs,
        }
      : current;
  if (
    !timestamp(budget.attempts) ||
    !timestamp(budget.nextAt) ||
    !timestamp(budget.expiresAt) ||
    budget.nextAt > budget.expiresAt ||
    budget.attempts >= policy.maxAttempts ||
    now >= budget.expiresAt
  )
    return { kind: 'stop' };
  if (now < budget.nextAt) return { kind: 'wait', at: budget.nextAt };

  const nextAt = Math.min(now + policy.delayMs, budget.expiresAt);
  if (!timestamp(nextAt) || nextAt <= now) return { kind: 'stop' };
  return {
    kind: 'reserve',
    reservation: {
      attempts: budget.attempts + 1,
      nextAt,
      expiresAt: budget.expiresAt,
    },
  };
}
