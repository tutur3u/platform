import { accountKey } from './accounts';
import { MAX_FUTURE_OBSERVATION_SKEW_MS } from './failure-receipt';
import type { AdmissionContext } from './hooks-types';
import { SIGNAL_TTL_MS } from './policy';

function hasFreshWindowAfter(
  account: AdmissionContext['accounts'][number],
  timestamp: number,
  context: AdmissionContext
) {
  return account.windows.some((window) => {
    const observed = Date.parse(window.observedAt);
    const reset = Date.parse(window.resetsAt ?? '');
    return (
      window.authoritative &&
      typeof window.usedPercent === 'number' &&
      observed > timestamp &&
      observed <= context.now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS &&
      context.now.getTime() - observed <= SIGNAL_TTL_MS[account.provider] &&
      Number.isFinite(reset) &&
      reset > context.now.getTime()
    );
  });
}

export function quarantineFuturePool(
  account: AdmissionContext['accounts'][number],
  context: AdmissionContext
) {
  context.ledger.futureQuarantines ??= {};
  const key = accountKey(account);
  const existing = Date.parse(context.ledger.futureQuarantines[key] ?? '');
  if (
    Number.isFinite(existing) &&
    hasFreshWindowAfter(account, existing, context)
  ) {
    delete context.ledger.futureQuarantines[key];
    return;
  }
  context.ledger.futureQuarantines[key] ??= context.now.toISOString();
}

export function applyFutureQuarantines(context: AdmissionContext) {
  for (const account of context.accounts) {
    const key = accountKey(account);
    const quarantinedAt = Date.parse(
      context.ledger.futureQuarantines?.[key] ?? ''
    );
    if (!Number.isFinite(quarantinedAt)) continue;
    if (hasFreshWindowAfter(account, quarantinedAt, context)) {
      delete context.ledger.futureQuarantines?.[key];
      continue;
    }
    account.windows = [];
    account.lastError = 'future-receipt-untrusted';
  }
}
