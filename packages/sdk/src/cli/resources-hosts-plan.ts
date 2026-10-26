import {
  type HostRegistry,
  type HostSpec,
  hostBudget,
  hostDiskFloor,
  type JobClass,
  jobClasses,
} from './resources-hosts-config';
import {
  capabilityBlocker,
  type HostCapability,
} from './resources-hosts-requirements';

// Pure admission planning: no I/O, so every scheduling rule is testable and
// the same function drives the live scheduler and the dry-run simulation.

export interface HostState {
  platform?: string;
  loadPerCpu?: number;
  queuedJobs?: number;
  remoteLanes?: { capacity: number; occupied: number };
  // Fresh, reachable and eligible for trusted work right now.
  healthy: boolean;
  reason?: string;
  // Free disk on the job volume; undefined means unknown, which fails closed.
  diskFreeGiB?: number;
  // Work this ledger does not own: local lane owners and waiters, or other
  // clients' runs on a runner. It occupies class slots and weight.
  external?: Partial<Record<JobClass, number>>;
  // Local lanes are first-come for lane FIFO waiters; heavy hosts jobs may
  // take a local lane only when none waits.
  laneWaiters?: number;
}
export interface Reservation {
  token: string;
  hostId: string;
  jobClass: JobClass;
  project: string;
  // Only host-scoped reservations claim capacity or count as admission. A
  // project-only lock never stands in for host-wide admission.
  scope: 'host' | 'project';
}
export interface Waiter {
  requires?: HostCapability[];
  placement?: 'auto';
  token: string;
  jobClass: JobClass;
  project: string;
  queuedAt: number;
  // Younger waiters admitted ahead of this one; persisted across rounds.
  bypassed: number;
  // Remote runners need a clean, pushed commit.
  remoteOk: boolean;
}
export interface Assignment {
  token: string;
  hostId: string;
}
export interface Plan {
  assignments: Assignment[];
  // Unassigned waiters with the closest blocker, for status output.
  blocked: Record<string, string>;
  // Waiters overtaken this round (their persisted counter increments).
  bypassed: string[];
}

interface Usage {
  lanes: number;
  slots: Record<JobClass, number>;
  cpus: number;
  memoryGiB: number;
}
export function usageFor(
  host: HostSpec,
  state: HostState | undefined,
  reservations: Reservation[]
): Usage {
  const usage: Usage = {
    lanes: state?.remoteLanes?.occupied ?? 0,
    slots: { light: 0, heavy: 0 },
    cpus: 0,
    memoryGiB: 0,
  };
  const add = (jobClass: JobClass, count: number) => {
    usage.slots[jobClass] += count;
    usage.cpus += host.weights[jobClass].cpus * count;
    usage.memoryGiB += host.weights[jobClass].memoryGiB * count;
  };
  for (const reservation of reservations)
    if (reservation.scope === 'host' && reservation.hostId === host.id) {
      usage.lanes += 1;
      add(reservation.jobClass, 1);
    }
  for (const jobClass of jobClasses)
    add(jobClass, state?.external?.[jobClass] ?? 0);
  return usage;
}

// Why `host` cannot take one more job of `jobClass` now, or undefined if it can.
export function hostBlocker(
  host: HostSpec,
  state: HostState | undefined,
  usage: Usage,
  waiter: Pick<Waiter, 'jobClass' | 'remoteOk' | 'requires'>
) {
  const { jobClass } = waiter;
  const capability = capabilityBlocker(host, waiter.requires);
  if (capability) return `${host.id}: ${capability}`;
  if (!state?.healthy)
    return `${host.id}: ${state?.reason ?? 'no fresh telemetry'}`;
  if (host.platform && state.platform !== host.platform)
    return `${host.id}: platform telemetry is unknown or differs from ${host.platform}`;
  if (host.kind === 'runner' && !waiter.remoteOk)
    return `${host.id}: remote runs need a clean, pushed commit`;
  if (
    state.diskFreeGiB === undefined ||
    !Number.isFinite(state.diskFreeGiB) ||
    state.diskFreeGiB < 0
  )
    return `${host.id}: free disk is unknown`;
  if (state.diskFreeGiB < hostDiskFloor(host))
    return `${host.id}: ${state.diskFreeGiB.toFixed(1)} GiB free is below the ${hostDiskFloor(host)} GiB floor`;
  if (state.remoteLanes && usage.lanes >= state.remoteLanes.capacity)
    return `${host.id}: physical lane slots full (${usage.lanes}/${state.remoteLanes.capacity})`;
  if (host.slots[jobClass] === 0) return `${host.id}: no ${jobClass} slots`;
  if (usage.slots[jobClass] >= host.slots[jobClass])
    return `${host.id}: ${jobClass} slots full (${usage.slots[jobClass]}/${host.slots[jobClass]})`;
  if (
    host.kind === 'local' &&
    jobClass === 'heavy' &&
    (state.laneWaiters ?? 0) > 0
  )
    return `${host.id}: ${state.laneWaiters} lane waiter(s) are ahead`;
  const budget = hostBudget(host);
  const weight = host.weights[jobClass];
  if (usage.cpus + weight.cpus > budget.cpus + 1e-9)
    return `${host.id}: CPU budget ${usage.cpus}/${budget.cpus} cannot fit ${weight.cpus}`;
  if (usage.memoryGiB + weight.memoryGiB > budget.memoryGiB + 1e-9)
    return `${host.id}: memory budget ${usage.memoryGiB}/${budget.memoryGiB} GiB cannot fit ${weight.memoryGiB}`;
  return undefined;
}
// Whether `host` could ever hold this waiter, so a starving waiter reserves
// it. Runner hosts never hold a waiter that cannot run remotely.
export function couldHold(
  host: HostSpec,
  waiter: Pick<Waiter, 'jobClass' | 'remoteOk' | 'requires'>
) {
  const budget = hostBudget(host);
  const weight = host.weights[waiter.jobClass];
  return (
    !capabilityBlocker(host, waiter.requires) &&
    (host.kind === 'local' || waiter.remoteOk) &&
    host.slots[waiter.jobClass] > 0 &&
    weight.cpus <= budget.cpus &&
    weight.memoryGiB <= budget.memoryGiB
  );
}
// No registered host could ever run it: fail fast instead of queueing forever.
export function canEverHold(
  registry: HostRegistry,
  waiter: Pick<Waiter, 'jobClass' | 'remoteOk' | 'requires'>
) {
  return registry.hosts.some((host) => couldHold(host, waiter));
}

/**
 * Plans one admission round.
 * - Starving waiters (bypassed >= maxBypass) go first, oldest first. If one
 *   cannot be placed, every host that could ever hold it stops admitting
 *   others (backpressure), so nobody starves.
 * - Everyone else is ordered by their project's live share, then age, so one
 *   project (for example Upskii) cannot monopolise a shared host.
 * - Light work prefers the local host (no transfer); heavy work prefers the
 *   host with the most CPU left after placement.
 */
export function planAdmissions(
  registry: HostRegistry,
  states: Record<string, HostState>,
  reservations: Reservation[],
  waiters: Waiter[]
): Plan {
  const usage = new Map(
    registry.hosts.map((host) => [
      host.id,
      usageFor(host, states[host.id], reservations),
    ])
  );
  const share = new Map<string, number>();
  for (const reservation of reservations)
    if (reservation.scope === 'host')
      share.set(reservation.project, (share.get(reservation.project) ?? 0) + 1);
  const { maxBypass } = registry.fairness;
  const remaining = [...waiters].sort((a, b) => a.queuedAt - b.queuedAt);
  const assignments: Assignment[] = [];
  const blocked: Record<string, string> = {};
  const held = new Set<string>();
  const place = (waiter: Waiter) => {
    const options = registry.hosts.filter((host) => !held.has(host.id));
    const reasons: string[] = [];
    let best: HostSpec | undefined;
    let bestScore = -Infinity;
    let bestRank = Infinity;
    let bestAuto: number[] | undefined;
    for (const host of options) {
      const current = usage.get(host.id)!;
      const reason = hostBlocker(host, states[host.id], current, waiter);
      if (reason) {
        reasons.push(reason);
        continue;
      }
      if (waiter.placement === 'auto') {
        if (!host.platform) {
          reasons.push(`${host.id}: OS registration is unknown`);
          continue;
        }
        const load = states[host.id]?.loadPerCpu;
        if (load === undefined || !Number.isFinite(load) || load < 0) {
          reasons.push(`${host.id}: load telemetry is unknown`);
          continue;
        }
        // Studios are the primary pool; Linux preserves pktm capacity and
        // local execution is the last eligible fallback. Free hosts follow
        // operator preference, then free lanes, load and disk headroom.
        const tier =
          host.kind === 'local' ? 2 : host.platform === 'linux' ? 1 : 0;
        const weight = host.weights[waiter.jobClass];
        const budget = hostBudget(host);
        const free = Math.min(
          host.slots[waiter.jobClass] - current.slots[waiter.jobClass],
          Math.floor((budget.cpus - current.cpus) / weight.cpus),
          Math.floor((budget.memoryGiB - current.memoryGiB) / weight.memoryGiB)
        );
        const score = [
          tier,
          host.preference ?? 99,
          -free,
          load,
          -(states[host.id]!.diskFreeGiB! - hostDiskFloor(host)),
        ];
        const firstDifference = bestAuto?.findIndex(
          (value, i) => value !== score[i]
        );
        if (
          !bestAuto ||
          (firstDifference !== undefined &&
            firstDifference >= 0 &&
            score[firstDifference]! < bestAuto[firstDifference]!)
        ) {
          best = host;
          bestAuto = score;
        }
        continue;
      }
      const left =
        hostBudget(host).cpus -
        current.cpus -
        host.weights[waiter.jobClass].cpus;
      const score =
        waiter.jobClass === 'light' && host.kind === 'local' ? Infinity : left;
      // The operator's preference orders hosts that already passed every
      // eligibility and capacity check; the capacity score breaks ties.
      const rank = host.preference ?? Infinity;
      if (rank < bestRank || (rank === bestRank && score > bestScore)) {
        best = host;
        bestScore = score;
        bestRank = rank;
      }
    }
    if (!best) {
      blocked[waiter.token] =
        reasons.join('; ') || 'every host is held for an older waiter';
      return false;
    }
    const current = usage.get(best.id)!;
    current.slots[waiter.jobClass] += 1;
    current.cpus += best.weights[waiter.jobClass].cpus;
    current.memoryGiB += best.weights[waiter.jobClass].memoryGiB;
    share.set(waiter.project, (share.get(waiter.project) ?? 0) + 1);
    assignments.push({ token: waiter.token, hostId: best.id });
    return true;
  };
  for (const waiter of remaining.filter(
    (entry) => entry.bypassed >= maxBypass
  )) {
    remaining.splice(remaining.indexOf(waiter), 1);
    if (!place(waiter))
      for (const host of registry.hosts)
        if (couldHold(host, waiter)) held.add(host.id);
  }
  while (remaining.length) {
    let index = 0;
    for (let i = 1; i < remaining.length; i++) {
      const a = remaining[i]!;
      const b = remaining[index]!;
      const shareA = share.get(a.project) ?? 0;
      const shareB = share.get(b.project) ?? 0;
      if (shareA < shareB || (shareA === shareB && a.queuedAt < b.queuedAt))
        index = i;
    }
    const [waiter] = remaining.splice(index, 1);
    place(waiter!);
  }
  const admitted = new Set(assignments.map((entry) => entry.token));
  const byToken = new Map(waiters.map((waiter) => [waiter.token, waiter]));
  const bypassed = waiters
    .filter(
      (waiter) =>
        !admitted.has(waiter.token) &&
        assignments.some(
          (entry) => byToken.get(entry.token)!.queuedAt > waiter.queuedAt
        )
    )
    .map((waiter) => waiter.token);
  return { assignments, blocked, bypassed };
}
