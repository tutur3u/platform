import type { BalancerConstraints } from './model';

// What a host probe reported, stamped with the controller's receive time.
// Every field the placement depends on is optional: a missing value is
// UNKNOWN, never assumed idle or healthy.
export interface BalancerHostTelemetry {
  deviceId: string;
  receivedAt: string;
  hostname?: string;
  platform?: string;
  arch?: string;
  cpus?: number;
  memoryGiB?: number;
  load1?: number;
  memoryPressure?: 'normal' | 'warn' | 'critical';
  diskFreeGiB?: number;
  ttrVersion?: string;
  // The host's one canonical `ttr resources` queue, across every project and
  // consumer on that machine.
  queue?: {
    enabled: boolean;
    lanes: number;
    occupied: number;
    waiting: number;
  };
  // Balancer runs the host record shows as not yet finished.
  activeRuns?: string[];
}

export interface BalancerHostPolicy {
  id: string;
  // Verified identity the probe must match before anything is placed.
  hostname: string;
  platform: string;
  arch: string;
  // Operator hold (maintenance, paused producers); never placed while set.
  hold?: string;
  maxLoadPerCpu?: number;
  minDiskGiB: number;
}

export type BalancerHostVerdict =
  | { status: 'eligible' }
  | { status: 'unknown'; reason: string }
  | { status: 'blocked'; reason: string }
  | { status: 'held'; reason: string };

export const BALANCER_TELEMETRY_TTL_MS = 60_000;

/**
 * Eligibility from fresh telemetry only. Missing or stale telemetry is
 * UNKNOWN, a hold always wins, and identity must match the registered device.
 * Capacity (slots, CPU and memory weights) is decided by the placement.
 */
export function balancerHostVerdict(
  policy: BalancerHostPolicy,
  telemetry: BalancerHostTelemetry | undefined,
  now: number,
  ttlMs = BALANCER_TELEMETRY_TTL_MS
): BalancerHostVerdict {
  if (policy.hold) return { status: 'held', reason: policy.hold };
  if (!telemetry) return { status: 'unknown', reason: 'no telemetry' };
  const age = now - Date.parse(telemetry.receivedAt);
  if (!Number.isFinite(age) || age < 0 || age >= ttlMs)
    return {
      status: 'unknown',
      reason: `telemetry from ${telemetry.receivedAt} is stale`,
    };
  if (
    telemetry.hostname !== policy.hostname ||
    telemetry.platform !== policy.platform ||
    telemetry.arch !== policy.arch
  )
    return {
      status: 'blocked',
      reason: `identity ${telemetry.hostname ?? '?'}/${telemetry.platform ?? '?'}/${telemetry.arch ?? '?'} does not match the registered device`,
    };
  const { queue, load1, cpus, diskFreeGiB, memoryPressure } = telemetry;
  if (!queue)
    return { status: 'unknown', reason: 'resource queue status is unknown' };
  if (!queue.enabled)
    return { status: 'blocked', reason: 'resource admission is disabled' };
  if (load1 === undefined || !cpus)
    return { status: 'unknown', reason: 'load telemetry is missing' };
  if (diskFreeGiB === undefined)
    return { status: 'unknown', reason: 'free disk is unknown' };
  if (!memoryPressure)
    return { status: 'unknown', reason: 'memory pressure is unknown' };
  const ceiling = policy.maxLoadPerCpu ?? 1;
  if (load1 / cpus >= ceiling)
    return {
      status: 'blocked',
      reason: `load ${(load1 / cpus).toFixed(2)} per CPU reaches ${ceiling}`,
    };
  if (memoryPressure === 'critical')
    return { status: 'blocked', reason: 'memory pressure is critical' };
  if (diskFreeGiB < policy.minDiskGiB)
    return {
      status: 'blocked',
      reason: `${diskFreeGiB.toFixed(1)} GiB free is below the ${policy.minDiskGiB} GiB floor`,
    };
  return { status: 'eligible' };
}

/** Whether a request's constraints allow this host at all. */
export function balancerConstraintBlocker(
  policy: BalancerHostPolicy,
  constraints: BalancerConstraints
) {
  if (constraints.hosts?.length && !constraints.hosts.includes(policy.id))
    return 'not in the requested hosts';
  if (constraints.excludeHosts?.includes(policy.id)) return 'excluded';
  if (constraints.os?.length && !constraints.os.includes(policy.platform))
    return `platform ${policy.platform} is not requested`;
  if (constraints.arch?.length && !constraints.arch.includes(policy.arch))
    return `architecture ${policy.arch} is not requested`;
  return undefined;
}
