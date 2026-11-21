import type { MiraInboundEvent } from './types';

/** Seven days covers Meta's webhook redelivery horizon, the longest in scope. */
export const LEDGER_MIN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Events older than this are recorded and never answered. */
export const DEFAULT_TURN_MAX_AGE_MS = 10 * 60 * 1000;
/** Allowed provider clock skew into the future. */
export const MAX_FUTURE_SKEW_MS = 30 * 1000;

export type LedgerOutcome = 'pending' | 'replied' | 'skipped' | 'escalated';

export interface LedgerEntry {
  key: string;
  receivedAtMs: number;
  outcome: LedgerOutcome;
}

export type IngestDecision =
  | { kind: 'accept'; key: string }
  | { kind: 'duplicate'; key: string; outcome: LedgerOutcome }
  | { kind: 'record_only'; key: string; reason: 'stale' | 'future' | 'self' };

export function ledgerKey(
  event: Pick<
    MiraInboundEvent,
    'channel' | 'providerAccountId' | 'providerEventId'
  >
): string {
  return JSON.stringify([
    event.channel,
    event.providerAccountId,
    event.providerEventId,
  ]);
}

/**
 * Decides what to do with an inbound event. The caller commits the returned
 * key in the same storage transaction before acknowledging the provider, so a
 * crash before commit is redelivered instead of lost, and a redelivery after
 * commit is a duplicate.
 */
export function decideIngest(args: {
  event: MiraInboundEvent;
  existing: LedgerEntry | null;
  nowMs: number;
  maxAgeMs?: number;
}): IngestDecision {
  const key = ledgerKey(args.event);
  if (args.existing) {
    return { kind: 'duplicate', key, outcome: args.existing.outcome };
  }
  if (args.event.fromSelf) {
    return { kind: 'record_only', key, reason: 'self' };
  }
  if (!Number.isFinite(args.event.providerTimestampMs)) {
    return { kind: 'record_only', key, reason: 'stale' };
  }
  const age = args.nowMs - args.event.providerTimestampMs;
  if (age < -MAX_FUTURE_SKEW_MS) {
    return { kind: 'record_only', key, reason: 'future' };
  }
  if (age > (args.maxAgeMs ?? DEFAULT_TURN_MAX_AGE_MS)) {
    return { kind: 'record_only', key, reason: 'stale' };
  }
  return { kind: 'accept', key };
}

/** Ledger rows may be pruned only after the redelivery horizon. */
export function ledgerPrunableBefore(nowMs: number): number {
  return nowMs - LEDGER_MIN_RETENTION_MS;
}
