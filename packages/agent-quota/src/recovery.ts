import { accountKey, recordObservation } from './admission';
import {
  failureClass,
  receiptReset,
  recoveryAdmissionKey,
} from './failure-receipt';
import { HookError } from './hook-ledger';
import type { AdmissionContext } from './hooks-types';
import type { ChildSnapshot } from './reconcile-children';

// Apply verified failures before choosing a pool, even when snapshots lag.
export function applyRecoveryReceipt(
  entry: Record<string, unknown>,
  context: AdmissionContext
) {
  if (entry.failureClass !== 'usage-limit' && entry.failureClass !== 'capacity')
    return;
  if (
    typeof entry.resetAt === 'string' &&
    Date.parse(entry.resetAt) <= context.now.getTime()
  )
    return;
  if (
    entry.failureClass === 'capacity' &&
    typeof entry.failureObservedAt === 'string' &&
    context.now.getTime() - Date.parse(entry.failureObservedAt) >= 60_000
  )
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
  recordObservation(context.ledger, {
    eventId: `${entry.recoveryAdmissionKey}:receipt`,
    model: typeof entry.model === 'string' ? entry.model : undefined,
    instanceId: account.instanceId,
    accountKey: accountKey(account),
    outcome:
      entry.failureClass === 'usage-limit' ? 'usage-limit' : 'capacity-error',
    observedAt: entry.failureObservedAt,
    resetsAt: typeof entry.resetAt === 'string' ? entry.resetAt : undefined,
  });
}

export function applyDescendantReceipts(
  snapshot: ChildSnapshot,
  context: AdmissionContext,
  timezone?: string
) {
  for (const receipt of snapshot.failures) {
    if (context.now.getTime() - Date.parse(receipt.observedAt) > 30 * 86400_000)
      continue;
    const run = snapshot.runs.find((run) => run.id === receipt.runId);
    if (
      !run ||
      !['failed', 'completed'].includes(run.status) ||
      run.rootNodeId !== receipt.nodeId
    )
      continue;
    const kind = failureClass(receipt.message, receipt.classification);
    if (
      !context.accounts.some((account) => account.instanceId === run.instanceId)
    )
      continue;
    applyRecoveryReceipt(
      {
        providerInstanceId: run.instanceId,
        model: run.model,
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
}
