import type { QuotaBlock } from './block-ledger';
import { matchingBlocks } from './block-ledger';
import { computeWindowPacing, type ObservationSample } from './pacing';
import {
  defaultRoutingConfig,
  type PacingConfig,
  type RoutingConfig,
  topUpsForbidden,
} from './routing-config';
import type { AccountPacing, AccountReserve, AccountUsage } from './types';
import { coversModel } from './window-scope';

export function computeAccountPacing(
  account: AccountUsage,
  activeCount: number,
  reserve: AccountReserve | undefined,
  historyByWindow: Record<string, ObservationSample[]>,
  now: Date,
  providerTtlMs: number,
  options: {
    model?: string;
    blocks?: QuotaBlock[];
    config?: PacingConfig;
    routingConfig?: RoutingConfig;
    hardLimitPercent?: number;
  } = {}
): AccountPacing {
  const routingConfig = options.routingConfig ?? defaultRoutingConfig();
  const config = options.config ?? routingConfig.pacing;
  const hardLimitPercent = options.hardLimitPercent ?? 90;
  const coveringWindows = account.windows.filter((window) =>
    coversModel(window, options.model)
  );
  const windowPacings = coveringWindows.map((window) => {
    const key = window.id ?? window.kind;
    return computeWindowPacing(
      window,
      historyByWindow[key] ?? [],
      now,
      providerTtlMs,
      config
    );
  });

  const reasons: string[] = [];
  const blocks = matchingBlocks(
    options.blocks ?? [],
    account.instanceIds ?? [account.instanceId],
    options.model,
    now
  );
  if (blocks.length) reasons.push('observed-block-ledger');
  if (
    account.balance?.exhausted &&
    topUpsForbidden(account.provider, routingConfig)
  ) {
    reasons.push('balance-exhausted', 'no-top-ups-policy');
  }
  if (account.available === false) reasons.push('catalog-unavailable');
  if (reserve?.excluded) reasons.push('reserved-excluded');

  const remainings = windowPacings
    .map((w) => w.remainingPercent)
    .filter((v): v is number => v !== null);
  const tightestRemainingPercent = remainings.length
    ? Math.min(...remainings)
    : null;

  const futureResets = windowPacings
    .filter((w) => w.msToReset !== null && w.msToReset > 0 && w.resetsAt)
    .sort((a, b) => (a.msToReset ?? 0) - (b.msToReset ?? 0));
  const soonestResetAt = futureResets[0]?.resetsAt ?? null;
  const soonestMsToReset = futureResets[0]?.msToReset ?? null;

  const floors = windowPacings
    .map((w) => w.glideFloorPercent)
    .filter((v): v is number => v !== null);
  const effectiveGlideFloorPercent = floors.length
    ? Math.max(...floors, reserve?.minRemainingPercent ?? 0)
    : (reserve?.minRemainingPercent ?? null);

  const headroomAboveFloorPercent =
    tightestRemainingPercent !== null && effectiveGlideFloorPercent !== null
      ? Math.round(
          (tightestRemainingPercent - effectiveGlideFloorPercent) * 100
        ) / 100
      : null;

  const burnRates = windowPacings
    .map((w) => w.burnRatePercentPerHour)
    .filter((v): v is number => v !== null);
  const burnRatePercentPerHour = burnRates.length
    ? Math.max(...burnRates)
    : null;

  const projections = windowPacings
    .filter((w) => w.projectedExhaustionAt !== null)
    .sort(
      (a, b) =>
        Date.parse(a.projectedExhaustionAt!) -
        Date.parse(b.projectedExhaustionAt!)
    );
  const projectedExhaustionAt = projections[0]?.projectedExhaustionAt ?? null;
  const projectedExhaustionBeforeReset = windowPacings.some(
    (w) => w.projectedExhaustionBeforeReset === true
  )
    ? true
    : windowPacings.some((w) => w.projectedExhaustionBeforeReset === false)
      ? false
      : null;

  let safeToAdmit =
    windowPacings.length > 0 &&
    windowPacings.every((w) => w.safeToAdmit) &&
    reasons.length === 0;

  if (
    tightestRemainingPercent !== null &&
    tightestRemainingPercent <= 100 - hardLimitPercent
  ) {
    safeToAdmit = false;
    reasons.push('near-or-at-hard-limit');
  }
  if (
    reserve?.minRemainingPercent !== undefined &&
    (tightestRemainingPercent === null ||
      tightestRemainingPercent < reserve.minRemainingPercent)
  ) {
    safeToAdmit = false;
    reasons.push('below-account-reserve');
  }
  if (!windowPacings.length) {
    safeToAdmit = false;
    reasons.push('no-covering-usage-window');
  }
  for (const wp of windowPacings) {
    for (const r of wp.reasons) {
      if (!reasons.includes(r)) reasons.push(r);
    }
  }

  let recommendedMaxConcurrentLanes = 0;
  if (
    safeToAdmit &&
    headroomAboveFloorPercent !== null &&
    headroomAboveFloorPercent > 0
  ) {
    const rawLanes =
      Math.floor(headroomAboveFloorPercent / config.laneHeadroomStepPercent) +
      1;
    const cap = reserve?.maxConcurrent ?? config.defaultMaxConcurrentLanes;
    recommendedMaxConcurrentLanes = Math.max(0, Math.min(cap, rawLanes));
  }
  const remainingSafeLanes = Math.max(
    0,
    recommendedMaxConcurrentLanes - activeCount
  );
  if (safeToAdmit && remainingSafeLanes === 0) {
    safeToAdmit = false;
    reasons.push('at-recommended-lane-cap');
  }

  return {
    tightestRemainingPercent,
    soonestResetAt,
    soonestMsToReset,
    effectiveGlideFloorPercent,
    headroomAboveFloorPercent,
    burnRatePercentPerHour,
    projectedExhaustionAt,
    projectedExhaustionBeforeReset,
    safeToAdmit,
    recommendedMaxConcurrentLanes,
    remainingSafeLanes,
    reasons,
    windows: windowPacings,
  };
}
