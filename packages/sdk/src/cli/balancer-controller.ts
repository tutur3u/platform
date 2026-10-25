import { randomUUID } from 'node:crypto';
import {
  acceptResult,
  advanceRun,
  type BalancerHostTelemetry,
  type BalancerResult,
  type BalancerRun,
  consumeResult,
  isBalancerTerminal,
} from '@tuturuuu/devbox';
import type { BalancerRegistry } from './balancer-hosts';
import type { BalancerLedger } from './balancer-ledger';
import { type BalancerHost, planBalancerRuns } from './balancer-placement';
import type { AgentReply, BalancerTransport } from './balancer-transport';

export interface ControllerDeps {
  ledger: BalancerLedger;
  registry: BalancerRegistry;
  transport: (host: BalancerHost) => BalancerTransport;
  now?: () => number;
  newLeaseId?: () => string;
  log?: (text: string) => void;
}
// Consecutive failed status reads before an active run is declared UNKNOWN.
export const LOST_CONTACT_FAILURES = 3;

const iso = (deps: ControllerDeps) =>
  new Date((deps.now ?? Date.now)()).toISOString();
const hostFor = (deps: ControllerDeps, id: string | undefined) =>
  deps.registry.hosts.find((host) => host.id === id);
const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function telemetryFromProbe(
  host: BalancerHost,
  value: Record<string, unknown>,
  receivedAt: string
): BalancerHostTelemetry {
  const queue = value.queue as Record<string, unknown> | undefined;
  const lanes = num(queue?.lanes);
  const occupied = num(queue?.occupied);
  const waiting = num(queue?.waiting);
  const pressure = value.memoryPressure;
  return {
    deviceId: host.id,
    receivedAt,
    hostname: typeof value.hostname === 'string' ? value.hostname : undefined,
    platform: typeof value.platform === 'string' ? value.platform : undefined,
    arch: typeof value.arch === 'string' ? value.arch : undefined,
    cpus: num(value.cpus),
    memoryGiB: num(value.memoryGiB),
    load1: num(value.load1),
    memoryPressure:
      pressure === 'normal' || pressure === 'warn' || pressure === 'critical'
        ? pressure
        : undefined,
    diskFreeGiB: num(value.diskFreeGiB),
    ttrVersion:
      typeof value.ttrVersion === 'string' ? value.ttrVersion : undefined,
    // A partial queue report is no report: UNKNOWN, not idle.
    queue:
      typeof queue?.enabled === 'boolean' &&
      lanes !== undefined &&
      occupied !== undefined &&
      waiting !== undefined
        ? { enabled: queue.enabled, lanes, occupied, waiting }
        : undefined,
    activeRuns: Array.isArray(value.activeRuns)
      ? value.activeRuns.filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : undefined,
  };
}

/** Probes every registered host in parallel; failures leave it UNKNOWN. */
export async function probeFleet(deps: ControllerDeps) {
  const entries = await Promise.all(
    deps.registry.hosts.map(async (host) => {
      if (host.hold) return [host.id, undefined] as const;
      const reply = await deps.transport(host).call(host, 'probe');
      return [
        host.id,
        reply.ok ? telemetryFromProbe(host, reply.value, iso(deps)) : undefined,
      ] as const;
    })
  );
  return Object.fromEntries(entries) as Record<
    string,
    BalancerHostTelemetry | undefined
  >;
}

async function transition(
  deps: ControllerDeps,
  run: BalancerRun,
  change: (current: BalancerRun) => BalancerRun
) {
  const { won, run: stored } = await deps.ledger.update(
    run.runId,
    run.revision,
    change
  );
  if (!won)
    deps.log?.(
      `${run.runId}: changed concurrently; keeping revision ${stored.revision}`
    );
  return stored;
}

/**
 * Write-ahead lease, then one start call. The lease is durable before the
 * host hears of it; an uncertain start becomes UNKNOWN and is reconciled
 * from the host record, never sent again.
 */
export async function dispatchRun(
  deps: ControllerDeps,
  run: BalancerRun,
  deviceId: string
) {
  const host = hostFor(deps, deviceId);
  if (!host) throw new Error(`Unknown host ${deviceId}.`);
  const at = iso(deps);
  const lease = {
    leaseId: (deps.newLeaseId ?? randomUUID)(),
    runId: run.runId,
    deviceId,
    fence: (run.lease?.fence ?? 0) + 1,
    issuedAt: at,
  };
  const placed = await deps.ledger.update(run.runId, run.revision, (current) =>
    advanceRun(current, 'placed', at, `placed on ${deviceId}`, {
      deviceId,
      lease,
      blockedBy: undefined,
    })
  );
  if (!placed.won) return placed.run;
  const reply = await deps.transport(host).call(
    host,
    'start',
    [],
    JSON.stringify({
      v: 1,
      runId: run.runId,
      leaseId: lease.leaseId,
      fence: lease.fence,
      deviceId,
      repo: run.source.repo,
      baseSha: run.source.baseSha,
      cwd: run.cwd,
      command: run.command,
      timeoutSeconds: run.timeoutSeconds,
      install: run.install,
    })
  );
  const after = iso(deps);
  return transition(deps, placed.run, (current) => {
    if (reply.ok && reply.value.accepted === true)
      return advanceRun(current, 'placed', after, 'host accepted');
    if (reply.ok)
      return advanceRun(
        current,
        'rejected',
        after,
        `host refused: ${String(reply.value.reason ?? 'unknown reason')}`
      );
    return advanceRun(
      current,
      'unknown',
      after,
      `start outcome is uncertain (${reply.error}); reconcile, never redispatch`
    );
  });
}

const hostAccepted = (run: BalancerRun) =>
  run.history.some((entry) => entry.reason === 'host accepted');

/** Reads the host record and settles the controller record from it. */
export async function reconcileRun(
  deps: ControllerDeps,
  run: BalancerRun,
  failures: Map<string, number> = new Map()
): Promise<BalancerRun> {
  if (isBalancerTerminal(run.state) || run.state === 'queued' || !run.lease)
    return run;
  const host = hostFor(deps, run.deviceId);
  const reply: AgentReply = host
    ? await deps.transport(host).call(host, 'status', [run.runId])
    : { ok: false, uncertain: true, error: 'host is no longer registered' };
  const at = iso(deps);
  if (!reply.ok) {
    const count = (failures.get(run.runId) ?? 0) + 1;
    failures.set(run.runId, count);
    if (count < LOST_CONTACT_FAILURES || run.state === 'unknown') return run;
    return transition(deps, run, (current) =>
      advanceRun(
        current,
        'unknown',
        at,
        `lost contact with ${run.deviceId}: ${reply.error}`
      )
    );
  }
  failures.delete(run.runId);
  const record = reply.value;
  if (record.exists !== true)
    return transition(deps, run, (current) =>
      hostAccepted(current)
        ? advanceRun(current, 'unknown', at, 'host record is missing')
        : advanceRun(
            current,
            'rejected',
            at,
            'host has no record of this lease; it never started'
          )
    );
  const lease = record.lease as Record<string, unknown> | undefined;
  if (lease?.leaseId !== run.lease.leaseId || lease?.fence !== run.lease.fence)
    return run.state === 'unknown'
      ? run
      : transition(deps, run, (current) =>
          advanceRun(
            current,
            'unknown',
            at,
            'host record belongs to another lease'
          )
        );
  if (record.result) {
    const verdict = acceptResult(run, record.result as BalancerResult, at);
    if (verdict.accepted) {
      if (verdict.duplicate) return run;
      return transition(deps, run, () => verdict.run);
    }
    return run.state === 'unknown'
      ? run
      : transition(deps, run, (current) =>
          advanceRun(
            current,
            'unknown',
            at,
            `host result rejected: ${verdict.reason}`
          )
        );
  }
  const phase = (record.phase as Record<string, unknown> | undefined)?.phase;
  if (record.alive === false && run.state !== 'unknown')
    return transition(deps, run, (current) =>
      advanceRun(
        current,
        'unknown',
        at,
        'host supervisor exited without a result'
      )
    );
  const next =
    phase === 'running'
      ? 'running'
      : phase === 'preparing'
        ? 'preparing'
        : undefined;
  if (
    next &&
    next !== run.state &&
    !(run.state === 'running' && next === 'preparing')
  )
    return transition(deps, run, (current) => advanceRun(current, next, at));
  return run;
}

/** Cancels a queued run locally; asks the host to stop a placed one. */
export async function cancelRun(
  deps: ControllerDeps,
  runId: string
): Promise<BalancerRun> {
  const run = await deps.ledger.readRun(runId);
  if (!run) throw new Error(`Run ${runId} does not exist.`);
  if (isBalancerTerminal(run.state)) return run;
  const at = iso(deps);
  if (run.state === 'queued') {
    const result = await deps.ledger.update(
      run.runId,
      run.revision,
      (current) =>
        advanceRun(current, 'cancelled', at, 'cancelled before placement')
    );
    return result.won ? result.run : cancelRun(deps, runId);
  }
  const marked = run.cancelRequestedAt
    ? run
    : await transition(deps, run, (current) =>
        advanceRun(current, current.state, at, 'cancel requested', {
          cancelRequestedAt: at,
        })
      );
  const host = hostFor(deps, marked.deviceId);
  if (host && marked.lease) {
    const reply = await deps
      .transport(host)
      .call(host, 'cancel', [marked.runId, marked.lease.leaseId]);
    deps.log?.(
      `${runId}: cancel ${reply.ok ? (reply.value.signalled ? 'signalled' : 'not signalled') : `uncertain (${reply.error})`}`
    );
  }
  return marked;
}

/** One controller round: settle active runs, then place queued ones. */
export async function balancerTick(
  deps: ControllerDeps,
  failures: Map<string, number>
) {
  for (const run of await deps.ledger.listRuns())
    if (!isBalancerTerminal(run.state) && run.state !== 'queued')
      await reconcileRun(deps, run, failures);
  const runs = await deps.ledger.listRuns();
  if (!runs.some((run) => run.state === 'queued' && !run.cancelRequestedAt))
    return { blocked: {} as Record<string, string>, verdicts: {} };
  const telemetry = await probeFleet(deps);
  const plan = planBalancerRuns(
    deps.registry.hosts,
    telemetry,
    runs,
    (deps.now ?? Date.now)(),
    deps.registry.telemetryTtlSeconds * 1000
  );
  for (const placement of plan.placements) {
    const run = runs.find((entry) => entry.runId === placement.runId)!;
    await dispatchRun(deps, run, placement.deviceId);
  }
  for (const [runId, reason] of Object.entries(plan.blocked)) {
    const run = await deps.ledger.readRun(runId);
    if (run?.state === 'queued' && run.blockedBy !== reason)
      await deps.ledger.update(run.runId, run.revision, (current) => ({
        ...current,
        blockedBy: reason,
        revision: current.revision + 1,
      }));
  }
  return { blocked: plan.blocked, verdicts: plan.verdicts };
}

export async function consumeRunResult(
  ledger: BalancerLedger,
  runId: string,
  threadId: string,
  at = new Date().toISOString()
) {
  for (;;) {
    const run = await ledger.readRun(runId);
    if (!run) throw new Error(`Run ${runId} does not exist.`);
    const consumed = consumeResult(run, threadId, at);
    if (consumed.alreadyConsumed) return { run, alreadyConsumed: true };
    const stored = await ledger.update(runId, run.revision, () => consumed.run);
    if (stored.won) return { run: stored.run, alreadyConsumed: false };
  }
}
