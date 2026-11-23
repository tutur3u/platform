import { defaultRoutingConfig, type PacingConfig } from './routing-config';
import type { UsageWindow, WindowPacing } from './types';
import { windowObservationIsFresh } from './window-freshness';

export { computeAccountPacing } from './account-pacing';

export interface ObservationSample {
  observedAt: string;
  usedPercent: number;
  resetsAt?: string | null;
}

function isLongWindow(
  window: Pick<
    UsageWindow,
    'kind' | 'providerWindowKind' | 'windowDurationMins'
  >
): boolean {
  return (
    window.kind === 'long' ||
    window.providerWindowKind === 'weekly' ||
    window.providerWindowKind === 'monthly' ||
    (typeof window.windowDurationMins === 'number' &&
      window.windowDurationMins > 1440)
  );
}

export function computeGlideFloorPercent(
  window: Pick<
    UsageWindow,
    'id' | 'kind' | 'providerWindowKind' | 'windowDurationMins'
  >,
  hoursToReset: number | null,
  config: PacingConfig = defaultRoutingConfig().pacing
): number | null {
  if (hoursToReset === null || !Number.isFinite(hoursToReset)) return null;
  const clampedHours = Math.max(0, hoursToReset);
  const durationMins = window.windowDurationMins;
  const effectiveDurationMins =
    typeof durationMins === 'number' &&
    Number.isFinite(durationMins) &&
    durationMins > 0
      ? durationMins
      : window.providerWindowKind === 'monthly' ||
          /month/i.test(window.id ?? '')
        ? 43_200
        : isLongWindow(window)
          ? 10_080
          : config.referenceWindowMins;
  const scale =
    effectiveDurationMins <= config.referenceWindowMins
      ? 1
      : config.referenceWindowMins / effectiveDurationMins;
  const floor =
    config.baseReservePercent +
    config.perHourReservePercent * scale * clampedHours;
  return Math.round(Math.min(100, Math.max(0, floor)) * 100) / 100;
}

function sameResetCycle(
  sample: ObservationSample,
  currentReset: string | null | undefined
): boolean {
  if (!currentReset || !sample.resetsAt) return true;
  const currentMs = Date.parse(currentReset);
  const sampleMs = Date.parse(sample.resetsAt);
  if (!Number.isFinite(currentMs) || !Number.isFinite(sampleMs)) return true;
  return Math.abs(currentMs - sampleMs) <= 5 * 60_000;
}

export function computeBurnRatePercentPerHour(
  observations: ObservationSample[],
  window: Pick<
    UsageWindow,
    'kind' | 'providerWindowKind' | 'resetsAt' | 'windowDurationMins'
  >,
  now: Date,
  config: PacingConfig = defaultRoutingConfig().pacing
): { burnRatePercentPerHour: number | null; observationCount: number } {
  const lookbackMs = isLongWindow(window)
    ? config.longHistoryLookbackMs
    : config.shortHistoryLookbackMs;
  const cutoffMs = now.getTime() - lookbackMs;

  const valid = observations
    .filter((sample) => {
      const ts = Date.parse(sample.observedAt);
      return (
        Number.isFinite(ts) &&
        ts <= now.getTime() + 5 * 60_000 &&
        ts >= cutoffMs &&
        typeof sample.usedPercent === 'number' &&
        Number.isFinite(sample.usedPercent) &&
        sample.usedPercent >= 0 &&
        sample.usedPercent <= 100 &&
        sameResetCycle(sample, window.resetsAt)
      );
    })
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  if (valid.length < 2) {
    return { burnRatePercentPerHour: null, observationCount: valid.length };
  }
  const first = valid[0]!;
  const last = valid[valid.length - 1]!;
  const deltaHours =
    (Date.parse(last.observedAt) - Date.parse(first.observedAt)) / 3_600_000;
  if (deltaHours <= 1 / 3600) {
    return { burnRatePercentPerHour: null, observationCount: valid.length };
  }
  const deltaUsed = last.usedPercent - first.usedPercent;
  const rate = Math.max(0, Math.round((deltaUsed / deltaHours) * 100) / 100);
  return { burnRatePercentPerHour: rate, observationCount: valid.length };
}

export function computeWindowPacing(
  window: UsageWindow,
  history: ObservationSample[],
  now: Date,
  providerTtlMs: number,
  config: PacingConfig = defaultRoutingConfig().pacing
): WindowPacing {
  const windowId = window.id ?? window.kind;
  const reasons: string[] = [];
  const usedPercent =
    typeof window.usedPercent === 'number' &&
    Number.isFinite(window.usedPercent) &&
    window.usedPercent >= 0 &&
    window.usedPercent <= 100
      ? window.usedPercent
      : null;
  const remainingPercent =
    usedPercent === null ? null : Math.round((100 - usedPercent) * 100) / 100;

  const resetMs = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  const resetsAt = Number.isFinite(resetMs)
    ? new Date(resetMs).toISOString()
    : null;
  const msToReset = Number.isFinite(resetMs) ? resetMs - now.getTime() : null;
  const hoursToReset =
    msToReset !== null && msToReset > 0
      ? Math.round((msToReset / 3_600_000) * 1000) / 1000
      : msToReset !== null
        ? 0
        : null;

  const mergedHistory: ObservationSample[] =
    usedPercent !== null
      ? [
          ...history,
          {
            observedAt: window.observedAt,
            usedPercent,
            resetsAt: window.resetsAt,
          },
        ]
      : history;

  const deduped = [
    ...new Map(
      mergedHistory.map((item) => [
        `${item.observedAt}|${item.usedPercent}`,
        item,
      ])
    ).values(),
  ];

  const { burnRatePercentPerHour, observationCount } =
    computeBurnRatePercentPerHour(deduped, window, now, config);

  const isIdleSessionStart =
    usedPercent === 0 &&
    window.providerWindowKind === 'session' &&
    !window.resetsAt &&
    window.authoritative;
  const glideFloorPercent = isIdleSessionStart
    ? config.baseReservePercent
    : computeGlideFloorPercent(window, hoursToReset, config);

  const headroomAboveFloorPercent =
    remainingPercent !== null && glideFloorPercent !== null
      ? Math.round((remainingPercent - glideFloorPercent) * 100) / 100
      : null;

  let projectedExhaustionAt: string | null = null;
  let projectedExhaustionBeforeReset: boolean | null = null;
  if (
    remainingPercent !== null &&
    burnRatePercentPerHour !== null &&
    burnRatePercentPerHour > 0
  ) {
    const msToExhaust = (remainingPercent / burnRatePercentPerHour) * 3_600_000;
    const exhaustMs = now.getTime() + msToExhaust;
    projectedExhaustionAt = new Date(exhaustMs).toISOString();
    if (msToReset !== null && msToReset > 0) {
      projectedExhaustionBeforeReset = exhaustMs < resetMs;
    }
  } else if (burnRatePercentPerHour === 0) {
    projectedExhaustionBeforeReset = false;
  }

  const fresh =
    window.authoritative &&
    windowObservationIsFresh(window, now, providerTtlMs) &&
    ((msToReset !== null && msToReset > 0) || isIdleSessionStart);

  let safeToAdmit = true;
  if (!fresh) {
    safeToAdmit = false;
    reasons.push('window-not-fresh-or-unknown');
  }
  if (remainingPercent === null) {
    safeToAdmit = false;
    reasons.push('remaining-unknown');
  } else if (remainingPercent <= 0) {
    safeToAdmit = false;
    reasons.push('window-exhausted');
  } else if (
    glideFloorPercent !== null &&
    remainingPercent <= glideFloorPercent
  ) {
    safeToAdmit = false;
    reasons.push('below-glide-floor');
  }
  if (projectedExhaustionBeforeReset === true) {
    safeToAdmit = false;
    reasons.push('projected-exhaustion-before-reset');
  }

  return {
    windowId,
    label: window.label,
    kind: window.kind,
    remainingPercent,
    usedPercent,
    resetsAt,
    msToReset,
    hoursToReset,
    glideFloorPercent,
    headroomAboveFloorPercent,
    burnRatePercentPerHour,
    observationCount,
    projectedExhaustionAt,
    projectedExhaustionBeforeReset,
    safeToAdmit,
    reasons,
  };
}
