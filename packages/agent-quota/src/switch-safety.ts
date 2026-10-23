import { HookError } from './hook-ledger';
import type { HookLedger, SwitchEvidence, SwitchLease } from './hooks-types';

export function acquireSwitchLease(
  ledger: HookLedger,
  input: Omit<SwitchLease, 'acquiredAt' | 'expiresAt'> & { ttlMs: number },
  now: Date
) {
  if (
    !Number.isInteger(input.ttlMs) ||
    input.ttlMs < 1000 ||
    input.ttlMs > 300_000
  )
    throw new HookError('lease-ttl-invalid');
  const conflicting = ledger.leases.filter(
    (lease) => lease.threadId === input.threadId
  );
  const live = conflicting.filter(
    (lease) => Date.parse(lease.expiresAt) > now.getTime()
  );
  const same = live.find(
    (lease) =>
      lease.attemptId === input.attemptId &&
      lease.threadId === input.threadId &&
      lease.accountKey === input.accountKey &&
      lease.pid === input.pid &&
      lease.processStartedAt === input.processStartedAt
  );
  if (same && live.length === 1)
    return { status: 'acquired' as const, lease: same, replay: true };
  if (live.length)
    return { status: 'block' as const, reasons: ['switch-lease-held'] };
  if (
    ledger.leaseHistory.some(
      (event) =>
        event.lease.threadId === input.threadId &&
        event.lease.attemptId === input.attemptId
    )
  )
    return { status: 'block' as const, reasons: ['switch-attempt-retired'] };
  for (const lease of conflicting)
    ledger.leaseHistory.push({
      action: 'expired-takeover',
      at: now.toISOString(),
      lease,
    });
  ledger.leases = ledger.leases.filter((lease) => !conflicting.includes(lease));
  const { ttlMs, ...identity } = input;
  const lease: SwitchLease = {
    ...identity,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  ledger.leases.push(lease);
  ledger.leaseHistory.push({ action: 'acquire', at: now.toISOString(), lease });
  return { status: 'acquired' as const, lease, replay: false };
}

export function releaseSwitchLease(
  ledger: HookLedger,
  identity: Pick<SwitchLease, 'threadId' | 'accountKey' | 'attemptId'>,
  now: Date
) {
  const lease = ledger.leases.find(
    (item) =>
      item.threadId === identity.threadId &&
      item.accountKey === identity.accountKey &&
      item.attemptId === identity.attemptId
  );
  if (!lease) return { status: 'released' as const, replay: true };
  ledger.leases = ledger.leases.filter((item) => item !== lease);
  ledger.leaseHistory.push({ action: 'release', at: now.toISOString(), lease });
  return { status: 'released' as const, replay: false };
}

export function checkSwitch(
  ledger: HookLedger,
  input: SwitchEvidence,
  now: Date
) {
  const reasons: string[] = [];
  const lease = ledger.leases.find((item) => item.threadId === input.threadId);
  if (!lease) reasons.push('switch-lease-missing');
  else if (
    lease.attemptId !== input.attemptId ||
    lease.accountKey !== input.accountKey
  )
    reasons.push('switch-lease-other-attempt');
  else if (
    !Number.isFinite(Date.parse(lease.expiresAt)) ||
    Date.parse(lease.expiresAt) <= now.getTime()
  )
    reasons.push('switch-lease-expired');
  const age = now.getTime() - Date.parse(input.observedAt);
  if (!Number.isFinite(age) || age < 0 || age > 5000)
    reasons.push('switch-evidence-stale');
  if (!input.threadIdle) reasons.push('thread-not-idle');
  if (input.queue.threadId !== input.threadId || !input.queue.complete)
    reasons.push('queue-evidence-incomplete');
  if (input.queue.items.length) reasons.push('queued-model-rollback-risk');
  if (input.unfinishedWriterIds.length) reasons.push('unfinished-writers');
  if (input.backgroundJobIds.length) reasons.push('background-jobs');
  if (!input.children.preserved) reasons.push('child-custody-unpreserved');
  if (!input.watches.preserved) reasons.push('watch-custody-unpreserved');
  if (input.uncertainMutationIds.length) reasons.push('uncertain-mutations');
  return {
    status: reasons.length ? 'block' : 'pass',
    reasons,
    expiresAt: lease?.expiresAt ?? null,
    preservedChildren: input.children.ids,
    preservedWatches: input.watches.ids,
  };
}
