import { type HostRegistry, hostDiskFloor } from './resources-hosts-config';
import {
  couldHold,
  type HostState,
  hostBlocker,
  type Reservation,
  usageFor,
  type Waiter,
} from './resources-hosts-plan';

// Only busy capacity may wait. Unreachable/stale telemetry, capability and
// disk failures are ineligible for this invocation, rather than queue targets.
export function autoQueueTarget(
  registry: HostRegistry,
  states: Record<string, HostState>,
  reservations: Reservation[],
  waiter: Waiter
) {
  let free = false;
  const candidates = registry.hosts.flatMap((host) => {
    const state = states[host.id];
    if (
      !host.platform ||
      !couldHold(host, waiter) ||
      !state?.healthy ||
      state.loadPerCpu === undefined ||
      !Number.isFinite(state.loadPerCpu) ||
      state.diskFreeGiB === undefined ||
      !Number.isFinite(state.diskFreeGiB) ||
      state.diskFreeGiB < hostDiskFloor(host)
    )
      return [];
    const usage = usageFor(host, state, reservations);
    const blocker = hostBlocker(host, state, usage, waiter);
    if (!blocker) {
      free = true;
      return [];
    }
    if (!/slots full|CPU budget|memory budget|lane waiter/u.test(blocker))
      return [];
    const slots = host.slots[waiter.jobClass];
    const jobs =
      usage.slots[waiter.jobClass] +
      (host.kind === 'local' ? (state.laneWaiters ?? 0) : 0);
    const expectedWaitSeconds =
      Math.max(1, Math.ceil((jobs + 1) / slots) - 1) *
      (host.expectedJobSeconds ?? 60);
    return [{ hostId: host.id, expectedWaitSeconds }];
  });
  if (free) return { free, target: undefined };
  const target = candidates.sort(
    (a, b) =>
      a.expectedWaitSeconds - b.expectedWaitSeconds ||
      a.hostId.localeCompare(b.hostId)
  )[0];
  return { free, target };
}
