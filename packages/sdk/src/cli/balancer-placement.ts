import {
  type BalancerHostTelemetry,
  type BalancerHostVerdict,
  type BalancerRun,
  balancerConstraintBlocker,
  balancerHostVerdict,
  isBalancerTerminal,
} from '@tuturuuu/devbox';
import type { HostRegistry, HostSpec } from './resources-hosts-config';
import {
  type HostState,
  planAdmissions,
  type Reservation,
} from './resources-hosts-plan';

// A registered balancer host: verified identity plus the same capacity
// model as `hosts.json`, so placement reuses the existing planner.
// Spelled out rather than extending BalancerHostPolicy, so the shape stays
// checked even where the published @tuturuuu/devbox types are unavailable.
export interface BalancerHost {
  id: string;
  hostname: string;
  platform: string;
  arch: string;
  hold?: string;
  maxLoadPerCpu?: number;
  minDiskGiB: number;
  minDiskFreePercent?: number;
  transport: { kind: 'local' } | { kind: 'ssh'; alias: string };
  capacity: HostSpec['capacity'];
  reserved: HostSpec['reserved'];
  weights: HostSpec['weights'];
  preference?: number;
}

export interface BalancerPlacement {
  runId: string;
  deviceId: string;
}
export interface BalancerPlan {
  placements: BalancerPlacement[];
  // Queued runs left waiting, with the closest blocker for each host.
  blocked: Record<string, string>;
  verdicts: Record<string, BalancerHostVerdict>;
}

// Every `ttr resources run` holds one lane of the host's canonical queue, so
// lanes are the slot count and all queue owners and waiters (any project,
// any consumer) occupy them. Balancer runs dispatched but not yet visible in
// the host record count too, so a probe taken before dispatch cannot hide them.
// Reservations are all charged at the weight of the run being placed: lanes
// are the binding limit and the host queue makes the final admission.
function hostSpec(
  host: BalancerHost,
  telemetry: BalancerHostTelemetry,
  run: BalancerRun
): HostSpec {
  const weight = host.weights[run.jobClass as 'light' | 'heavy'];
  return {
    id: host.id,
    kind: 'runner',
    runnerId: host.id,
    capacity: host.capacity,
    reserved: host.reserved,
    slots: { light: 0, heavy: Math.min(16, telemetry.queue?.lanes ?? 0) },
    weights: { light: weight, heavy: weight },
    workers: { light: 1, heavy: 1 },
    preference: host.preference,
    maxLoadPerCpu: host.maxLoadPerCpu,
  };
}

/**
 * Places queued runs, highest priority then oldest first. Each replica of a
 * request lands on a distinct host. Hosts without fresh, complete telemetry
 * are UNKNOWN and never receive work; a run with no eligible capacity stays
 * queued with its blocker.
 */
export function planBalancerRuns(
  hosts: BalancerHost[],
  telemetry: Record<string, BalancerHostTelemetry | undefined>,
  runs: BalancerRun[],
  now: number,
  ttlMs?: number
): BalancerPlan {
  const verdicts: Record<string, BalancerHostVerdict> = {};
  const eligible: { host: BalancerHost; telemetry: BalancerHostTelemetry }[] =
    [];
  const states: Record<string, HostState> = {};
  for (const host of hosts) {
    const entry = telemetry[host.id];
    const verdict = balancerHostVerdict(host, entry, now, ttlMs);
    verdicts[host.id] = verdict;
    if (verdict.status !== 'eligible' || !entry?.queue) continue;
    eligible.push({ host, telemetry: entry });
    states[host.id] = {
      healthy: true,
      diskFreeGiB: entry.diskFreeGiB,
      external: { heavy: entry.queue.occupied + entry.queue.waiting },
    };
  }
  const reservations: Reservation[] = [];
  const reserve = (runId: string, hostId: string, project: string) =>
    reservations.push({
      token: runId,
      hostId,
      jobClass: 'heavy',
      project,
      scope: 'host',
    });
  for (const run of runs)
    if (
      run.deviceId &&
      !isBalancerTerminal(run.state) &&
      run.state !== 'queued' &&
      !telemetry[run.deviceId]?.activeRuns?.includes(run.runId)
    )
      reserve(run.runId, run.deviceId, run.requestId);

  const used = new Map<string, Set<string>>();
  for (const run of runs)
    if (run.deviceId && run.state !== 'queued')
      used.set(
        run.requestId,
        (used.get(run.requestId) ?? new Set()).add(run.deviceId)
      );

  const queued = runs
    .filter((run) => run.state === 'queued' && !run.cancelRequestedAt)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.queuedAt.localeCompare(b.queuedAt) ||
        a.runId.localeCompare(b.runId)
    );
  const placements: BalancerPlacement[] = [];
  const blocked: Record<string, string> = {};
  for (const run of queued) {
    const taken = used.get(run.requestId) ?? new Set<string>();
    const reasons: string[] = [];
    const allowed = eligible
      .filter(({ host }) => {
        const constraint = balancerConstraintBlocker(host, run.constraints);
        if (constraint) reasons.push(`${host.id}: ${constraint}`);
        else if (taken.has(host.id))
          reasons.push(`${host.id}: already runs another replica`);
        return !constraint && !taken.has(host.id);
      })
      .map(({ host, telemetry: entry }) => hostSpec(host, entry, run));
    for (const host of hosts)
      if (verdicts[host.id]!.status !== 'eligible')
        reasons.push(
          `${host.id}: ${verdicts[host.id]!.status} (${(verdicts[host.id] as { reason: string }).reason})`
        );
    if (!allowed.length) {
      blocked[run.runId] = reasons.join('; ') || 'no registered hosts';
      continue;
    }
    const registry: HostRegistry = {
      version: 1,
      hosts: allowed,
      fairness: { maxBypass: 0 },
      telemetryTtlSeconds: 60,
    };
    const plan = planAdmissions(registry, states, reservations, [
      {
        token: run.runId,
        jobClass: 'heavy',
        project: run.requestId,
        queuedAt: Date.parse(run.queuedAt),
        bypassed: 0,
        remoteOk: true,
      },
    ]);
    const assignment = plan.assignments[0];
    if (!assignment) {
      blocked[run.runId] = [plan.blocked[run.runId], ...reasons]
        .filter(Boolean)
        .join('; ');
      continue;
    }
    placements.push({ runId: run.runId, deviceId: assignment.hostId });
    reserve(run.runId, assignment.hostId, run.requestId);
    used.set(run.requestId, taken.add(assignment.hostId));
  }
  return { placements, blocked, verdicts };
}
