import { accountKey, recordObservation } from './admission';
import { CAPACITY_COOLDOWN_MS } from './capacity';
import {
  failureClass,
  receiptReset,
  recoveryAdmissionKey,
} from './failure-receipt';
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
  recordObservation(context.ledger, {
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
        ? new Date(
            Date.parse(entry.failureObservedAt) + CAPACITY_COOLDOWN_MS
          ).toISOString()
        : undefined,
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
}
