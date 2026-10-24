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
  providerTtlMs: number,
  maxFutureSkewMs = 5 * 60_000
) {
  const observedAt = Date.parse(window.observedAt);
  const ttlMs = windowFreshnessTtlMs(window, providerTtlMs);
  return (
    Number.isFinite(observedAt) &&
    observedAt <= now.getTime() + maxFutureSkewMs &&
    ttlMs > 0 &&
    now.getTime() - observedAt <= ttlMs
  );
}
