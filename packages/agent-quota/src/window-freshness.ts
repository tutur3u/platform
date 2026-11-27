import type { UsageWindow } from './types';

export const PROVIDER_USAGE_SNAPSHOT_MAX_AGE_MS = 5 * 60_000;
export const ANTIGRAVITY_ACCOUNT_TTL_MS = 11 * 60_000;

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

function isUnstartedAntigravityWindow(window: UsageWindow): boolean {
  return (
    window.confidence === 'provider' &&
    window.usedPercent === 0 &&
    Date.parse(window.resetsAt ?? '') === 0 &&
    /^(gemini|3p)-(weekly|5h)$/.test(window.id ?? '')
  );
}

export function isUnstartedWindow(window: UsageWindow): boolean {
  return (
    window.authoritative &&
    (isUnstartedAntigravityWindow(window) ||
      (window.usedPercent === 0 &&
        window.providerWindowKind === 'session' &&
        !window.resetsAt))
  );
}

export function windowResetAt(window: UsageWindow): string | undefined {
  return isUnstartedWindow(window) ? undefined : (window.resetsAt ?? undefined);
}

export function windowHasCurrentReset(window: UsageWindow, now: Date): boolean {
  return (
    isUnstartedWindow(window) ||
    Date.parse(window.resetsAt ?? '') > now.getTime()
  );
}
