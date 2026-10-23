import { accountKey, recordObservation } from './admission';
import { CAPACITY_COOLDOWN_MS } from './capacity';
import {
  failureClass,
  MAX_FUTURE_OBSERVATION_SKEW_MS,
  receiptReset,
  recoveryAdmissionKey,
} from './failure-receipt';
import {
  applyFutureQuarantines,
  quarantineFuturePool,
} from './future-quarantine';
import { HookError } from './hook-ledger';
import type { AdmissionContext } from './hooks-types';
import type { ChildSnapshot } from './reconcile-children';
import { receiptWindowScope } from './window-scope';

// Apply verified failures before choosing a pool, even when snapshots lag.
export function applyRecoveryReceipt(
  entry: Record<string, unknown>,
  context: AdmissionContext
) {
  if (entry.failureClass !== 'usage-limit' && entry.failureClass !== 'capacity')
    return;
  const observedAt =
    typeof entry.failureObservedAt === 'string'
      ? Date.parse(entry.failureObservedAt)
      : Number.NaN;
  if (
    !Number.isFinite(observedAt) ||
    observedAt > context.now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS
  ) {
    const futureAccount = context.accounts.find(
      (item) => item.instanceId === entry.providerInstanceId
    );
    if (futureAccount) quarantineFuturePool(futureAccount, context);
    return;
  }
  if (
    entry.failureClass === 'capacity' &&
    typeof entry.failureObservedAt === 'string' &&
    context.now.getTime() - Date.parse(entry.failureObservedAt) >=
      CAPACITY_COOLDOWN_MS
  )
    return;
  if (entry.failureClass === 'capacity' && typeof entry.model !== 'string')
    return;
  const account = context.accounts.find(
    (x) => x.instanceId === entry.providerInstanceId
  );
  if (
    !account ||
    typeof entry.failureObservedAt !== 'string' ||
    typeof entry.recoveryAdmissionKey !== 'string'
  )
    throw new HookError('recovery-account-or-receipt-unverified');
  if (
    context.ledger.observations.some(
      (event) => event.eventId === `${entry.recoveryAdmissionKey}:receipt`
    )
  )
    return;
  recordObservation(
    context.ledger,
    {
      eventId: `${entry.recoveryAdmissionKey}:receipt`,
      model: typeof entry.model === 'string' ? entry.model : undefined,
      windowScope: receiptWindowScope(
        account.provider,
        typeof entry.model === 'string' ? entry.model : undefined,
        typeof entry.receipt === 'string' ? entry.receipt : ''
      ),
      instanceId: account.instanceId,
      accountKey: accountKey(account),
      outcome:
        entry.failureClass === 'usage-limit' ? 'usage-limit' : 'capacity-error',
      observedAt: entry.failureObservedAt,
      resetsAt:
        entry.failureClass !== 'capacity' && typeof entry.resetAt === 'string'
          ? entry.resetAt
          : undefined,
      nextEligibleAt:
        entry.failureClass === 'capacity'
          ? new Date(observedAt + CAPACITY_COOLDOWN_MS).toISOString()
          : undefined,
    },
    context.now
  );
}

export function applyDescendantReceipts(
  snapshot: ChildSnapshot,
  context: AdmissionContext,
  timezone?: string
) {
  for (const receipt of snapshot.failures) {
    const observedAt = Date.parse(receipt.observedAt);
    if (!Number.isFinite(observedAt)) continue;
    const run = snapshot.runs.find((run) => run.id === receipt.runId);
    if (
      !run ||
      !['failed', 'completed'].includes(run.status) ||
      run.rootNodeId !== receipt.nodeId
    )
      continue;
    if (context.now.getTime() - observedAt > 30 * 86400_000) continue;
    const kind = failureClass(receipt.message, receipt.classification);
    const account = context.accounts.find(
      (item) => item.instanceId === run.instanceId
    );
    if (!account) continue;
    if (observedAt > context.now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS) {
      quarantineFuturePool(account, context);
      continue;
    }
    applyRecoveryReceipt(
      {
        providerInstanceId: run.instanceId,
        model: run.model,
        receipt: receipt.message,
        failureClass: kind,
        failureObservedAt: receipt.observedAt,
        resetAt:
          receipt.resetAt ??
          receiptReset(receipt.message, receipt.observedAt, timezone),
        recoveryAdmissionKey: recoveryAdmissionKey(run.threadId, run.id, kind),
      },
      context
    );
  }
  applyFutureQuarantines(context);
}
