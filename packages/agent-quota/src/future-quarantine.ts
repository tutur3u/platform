import { accountKey } from './accounts';
import { MAX_FUTURE_OBSERVATION_SKEW_MS } from './failure-receipt';
import { FUTURE_QUARANTINE_TTL_MS } from './future-quarantine-constants';
import type {
  AdmissionContext,
  FutureQuarantine,
  HookLedger,
} from './hooks-types';
import { SIGNAL_TTL_MS } from './policy';
import { coversModel } from './window-scope';

export { FUTURE_QUARANTINE_TTL_MS } from './future-quarantine-constants';

function quarantineRecord(value: FutureQuarantine | string): FutureQuarantine {
  if (typeof value === 'string')
    return {
      quarantinedAt: value,
      models: [],
      accountWide: true,
    };
  return value;
}

export function recordFutureQuarantine(
  ledger: HookLedger,
  key: string,
  now: Date,
  receipt?: { observedAt: string; model?: string }
) {
  ledger.futureQuarantines ??= {};
  const current = ledger.futureQuarantines[key];
  const quarantine = current
    ? quarantineRecord(current)
    : { quarantinedAt: now.toISOString(), models: [], accountWide: false };
  if (receipt) {
    const receiptTime = Date.parse(receipt.observedAt);
    const trustedTimestamp = Number.isFinite(receiptTime)
      ? receipt.observedAt
      : now.toISOString();
    if (
      !quarantine.latestReceiptAt ||
      !Number.isFinite(Date.parse(quarantine.latestReceiptAt)) ||
      Date.parse(trustedTimestamp) > Date.parse(quarantine.latestReceiptAt)
    )
      quarantine.latestReceiptAt = trustedTimestamp;
    if (!Number.isFinite(receiptTime)) {
      quarantine.accountWide = true;
    } else if (isValidModel(receipt.model)) {
      quarantine.models = [
        ...new Set([...quarantine.models, receipt.model]),
      ].slice(-64);
    } else {
      quarantine.accountWide = true;
    }
  }
  ledger.futureQuarantines[key] = quarantine;
}

function isValidModel(model: string | undefined): model is string {
  return typeof model === 'string' && model.length > 0 && model.length <= 512;
}

function hasFreshWindowAfter(
  account: AdmissionContext['accounts'][number],
  timestamp: number,
  context: AdmissionContext,
  model?: string
) {
  return account.windows.some((window) => {
    const observed = Date.parse(window.observedAt);
    const reset = Date.parse(window.resetsAt ?? '');
    return (
      window.authoritative &&
      typeof window.usedPercent === 'number' &&
      coversModel(window, model) &&
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
  context: AdmissionContext,
  receipt?: { observedAt: string; model?: string }
) {
  recordFutureQuarantine(
    context.ledger,
    accountKey(account),
    context.now,
    receipt
  );
}

export function applyFutureQuarantines(context: AdmissionContext) {
  for (const account of context.accounts) {
    const key = accountKey(account);
    const value = context.ledger.futureQuarantines?.[key];
    if (!value) continue;
    const quarantine = quarantineRecord(value);
    const quarantinedAt = Date.parse(quarantine.quarantinedAt);
    const receiptAt = Date.parse(quarantine.latestReceiptAt ?? '');
    const receiptStillTooFarAhead =
      Number.isFinite(receiptAt) &&
      receiptAt > context.now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS;
    const latestRelevantTime = Number.isFinite(receiptAt)
      ? Math.max(quarantinedAt, receiptAt)
      : quarantinedAt;
    const freshAccountWide =
      quarantine.accountWide &&
      hasFreshWindowAfter(account, latestRelevantTime, context);
    const freshModelWindows =
      quarantine.models.length > 0 &&
      quarantine.models.every((model) =>
        hasFreshWindowAfter(account, latestRelevantTime, context, model)
      );
    if (
      !Number.isFinite(quarantinedAt) ||
      context.now.getTime() - quarantinedAt > FUTURE_QUARANTINE_TTL_MS
    ) {
      delete context.ledger.futureQuarantines?.[key];
      continue;
    }
    const freshWindow = quarantine.accountWide
      ? freshAccountWide
      : freshModelWindows;
    if (!receiptStillTooFarAhead && freshWindow) {
      delete context.ledger.futureQuarantines?.[key];
      continue;
    }
    account.windows = [];
    account.lastError = 'future-receipt-untrusted';
  }
}
