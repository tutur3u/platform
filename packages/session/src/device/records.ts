/**
 * Operation records and their bounds. Records keep their full body 24 hours
 * and their ids 7 days after that; at most 256 records and 4,096 expired ids
 * exist at once. Security records are never moved or dropped early;
 * fenced-only records (`switch`, `rotate`) may be, because a replay of one
 * fails its fence.
 */
import type {
  DeviceState,
  ExpiredOperation,
  OperationRecord,
  RecordedKind,
} from './types';

export const RECORD_TTL_MS = 24 * 60 * 60_000;
export const EXPIRED_ID_TTL_MS = 7 * 24 * 60 * 60_000;
export const MAX_RECORDS = 256;
export const MAX_EXPIRED_IDS = 4_096;

const FENCED_ONLY: ReadonlySet<RecordedKind> = new Set(['switch', 'rotate']);

export function isFencedOnly(kind: RecordedKind): boolean {
  return FENCED_ONLY.has(kind);
}

/** Moves records past 24 hours into the id map and drops ids past their 7 days. */
export function ageRecords(draft: DeviceState, nowMs: number): void {
  for (const [id, record] of Object.entries(draft.operations)) {
    if (nowMs >= record.expiresAtMs) {
      delete draft.operations[id];
      draft.expiredOperations[id] = {
        expiredAtMs: record.expiresAtMs,
        fencedOnly: isFencedOnly(record.kind),
      };
    }
  }
  for (const [id, expired] of Object.entries(draft.expiredOperations)) {
    if (nowMs >= expired.expiredAtMs + EXPIRED_ID_TTL_MS) {
      delete draft.expiredOperations[id];
    }
  }
}

function oldestFencedOnlyRecord(draft: DeviceState): string | null {
  let best: [string, OperationRecord] | null = null;
  for (const entry of Object.entries(draft.operations)) {
    if (!isFencedOnly(entry[1].kind)) continue;
    if (!best || entry[1].expiresAtMs < best[1].expiresAtMs) best = entry;
  }
  return best?.[0] ?? null;
}

function oldestFencedOnlyId(draft: DeviceState): string | null {
  let best: [string, ExpiredOperation] | null = null;
  for (const entry of Object.entries(draft.expiredOperations)) {
    if (!entry[1].fencedOnly) continue;
    if (!best || entry[1].expiredAtMs < best[1].expiredAtMs) best = entry;
  }
  return best?.[0] ?? null;
}

/**
 * Makes room for one more record within both caps, moving and dropping only
 * fenced-only entries early. Returns false, leaving the draft as it may have
 * partly been changed, when there is no room; the caller then discards the
 * draft and returns `rate_limited`.
 */
export function makeRoom(draft: DeviceState, nowMs: number): boolean {
  while (Object.keys(draft.operations).length >= MAX_RECORDS) {
    const id = oldestFencedOnlyRecord(draft);
    if (!id) return false;
    delete draft.operations[id];
    draft.expiredOperations[id] = { expiredAtMs: nowMs, fencedOnly: true };
  }
  while (Object.keys(draft.expiredOperations).length > MAX_EXPIRED_IDS) {
    const id = oldestFencedOnlyId(draft);
    if (!id) return false;
    delete draft.expiredOperations[id];
  }
  return true;
}

export function storeRecord(
  draft: DeviceState,
  operationId: string,
  record: Omit<OperationRecord, 'expiresAtMs'>,
  nowMs: number
): void {
  draft.operations[operationId] = {
    ...record,
    expiresAtMs: nowMs + RECORD_TTL_MS,
  };
}

export type OperationStatus = 'succeeded' | 'rejected' | 'expired' | 'absent';

/**
 * The index lease's view of one operation: `succeeded` or `rejected` from a
 * stored result, `expired` once only its id remains, otherwise `absent`.
 */
export function operationStatus(
  state: DeviceState,
  operationId: string
): OperationStatus {
  const record = Object.hasOwn(state.operations, operationId)
    ? state.operations[operationId]
    : undefined;
  if (record) return record.result.ok ? 'succeeded' : 'rejected';
  if (Object.hasOwn(state.expiredOperations, operationId)) return 'expired';
  return 'absent';
}
