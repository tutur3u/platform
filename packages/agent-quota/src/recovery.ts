import { accountKey, recordObservation } from './admission';
import { HookError } from './hook-ledger';
import type { AdmissionContext } from './hooks-types';

// Apply verified failures before choosing a pool, even when snapshots lag.
export function applyRecoveryReceipt(
  entry: Record<string, unknown>,
  context: AdmissionContext
) {
  if (entry.failureClass !== 'usage-limit' && entry.failureClass !== 'capacity')
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
    instanceId: account.instanceId,
    accountKey: accountKey(account),
    outcome:
      entry.failureClass === 'usage-limit' ? 'usage-limit' : 'capacity-error',
    observedAt: entry.failureObservedAt,
    resetsAt: typeof entry.resetAt === 'string' ? entry.resetAt : undefined,
  });
}
