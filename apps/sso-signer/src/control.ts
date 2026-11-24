/**
 * Operator control of the stop fence. `ControlEntry` checks the control
 * caller key before reading any other argument, and `SignerControl` checks
 * it again, so a binding to the object alone cannot move the fence.
 */
import {
  createFenceStore,
  type FenceRecord,
  isFenceMode,
  MAX_REASON_LENGTH,
} from './fence-store';
import { checkCallerKey, parseKeySet } from './key-set';
import type { SqlRunner } from './sql';

export type ControlResult =
  | Readonly<{ ok: true; fence: FenceRecord }>
  | Readonly<{ ok: false; error: 'unauthorized' | 'invalid_request' }>;

const UNAUTHORIZED: ControlResult = Object.freeze({
  ok: false,
  error: 'unauthorized',
});

export function isControlKey(secret: unknown, presented: unknown): boolean {
  return checkCallerKey(parseKeySet(secret), presented);
}

/** Operator text only: printable, bounded, no line breaks. */
function validReason(reason: unknown): reason is string {
  return (
    typeof reason === 'string' &&
    reason.trim().length > 0 &&
    reason.length <= MAX_REASON_LENGTH &&
    /^[\x20-\x7e]+$/u.test(reason)
  );
}

export function createControlHandlers(input: {
  sql: SqlRunner;
  secret: () => unknown;
  now: () => number;
}) {
  const store = createFenceStore(input.sql);
  return Object.freeze({
    fenceMode: () => store.read().mode,
    readFence(key: unknown): ControlResult {
      if (!isControlKey(input.secret(), key)) return UNAUTHORIZED;
      return { ok: true, fence: store.read() };
    },
    setFence(key: unknown, mode: unknown, reason: unknown): ControlResult {
      if (!isControlKey(input.secret(), key)) return UNAUTHORIZED;
      if (!isFenceMode(mode) || !validReason(reason)) {
        return { ok: false, error: 'invalid_request' };
      }
      console.info('[sso-signer] fence set', mode);
      return { ok: true, fence: store.set(mode, reason, input.now()) };
    },
  });
}
