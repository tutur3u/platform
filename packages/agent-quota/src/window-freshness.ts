import type { UsageWindow } from './types';

export const PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

export function windowFreshnessTtlMs(
  window: Pick<UsageWindow, 'freshnessTtlMs'>,
  providerTtlMs: number
) {
  return typeof window.freshnessTtlMs === 'number' &&
    Number.isFinite(window.freshnessTtlMs) &&
    window.freshnessTtlMs >= 0
    ? Math.min(window.freshnessTtlMs, providerTtlMs)
    : providerTtlMs;
}

export function windowObservationIsFresh(
  window: Pick<UsageWindow, 'observedAt' | 'freshnessTtlMs'>,
  now: Date,
  providerTtlMs: number
) {
  const observedAt = Date.parse(window.observedAt);
  return (
    Number.isFinite(observedAt) &&
    observedAt <= now.getTime() + 5 * 60_000 &&
    now.getTime() - observedAt <= windowFreshnessTtlMs(window, providerTtlMs)
  );
}
