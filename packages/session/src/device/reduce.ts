/**
 * The recorded-mutation reducer: shape validation, the operation record
 * lookup (commit rule step 1), the fence (step 2) and the reduction with its
 * bounds and record (step 3). The commit loop drives it against the store.
 */
import { constantTimeEqual } from '../encoding';
import { pruneGrants } from './outbox';
import { ageRecords, makeRoom, storeRecord } from './records';
import { reduceRotate, reduceSwitch } from './reduce-account';
import { reduceRedeemChild } from './reduce-child';
import { type DeviceContext, failure, type KindOutcome } from './reduce-common';
import { reduceRecordFactors } from './reduce-factors';
import { reduceSignIn } from './reduce-sign-in';
import { reduceConsumeStepUp, reduceGrantStepUp } from './reduce-step-up';
import { fenceMatches, isRevocation } from './revocations';
import type { MintedSecret } from './sessions';
import type {
  DeviceMutation,
  DeviceState,
  Effect,
  EpochRaise,
  Fence,
  MutationOf,
  OperationRecord,
  OperationResult,
  RecordedKind,
} from './types';

export type RecordedMutation = MutationOf<RecordedKind>;

const FENCE_RULES: Record<
  DeviceMutation['kind'],
  'required' | 'nullable' | 'none'
> = {
  sign_in: 'nullable',
  switch: 'required',
  rotate: 'required',
  record_factors: 'required',
  redeem_child: 'none',
  revoke: 'nullable',
  revoke_user_below_epoch: 'none',
  revoke_user_on_device: 'none',
  grant_step_up: 'required',
  consume_step_up: 'required',
};

const MAX_OPERATION_ID_LENGTH = 128;

function validFence(fence: unknown): boolean {
  if (typeof fence !== 'object' || fence === null) return false;
  const raw = fence as Record<string, unknown>;
  return (
    (raw.sessionId === null || typeof raw.sessionId === 'string') &&
    Number.isSafeInteger(raw.gen) &&
    Number.isSafeInteger(raw.version)
  );
}

/**
 * The checks that need no state: a known kind, an operation id, a safe
 * integer clock and the fence rule. A null fence is accepted only for a
 * `sign_in` and a logout.
 */
export function validMutationShape(mutation: DeviceMutation): boolean {
  if (typeof mutation !== 'object' || mutation === null) return false;
  const rule = Object.hasOwn(FENCE_RULES, mutation.kind)
    ? FENCE_RULES[mutation.kind]
    : undefined;
  if (!rule) return false;
  if (
    typeof mutation.operationId !== 'string' ||
    mutation.operationId.length === 0 ||
    mutation.operationId.length > MAX_OPERATION_ID_LENGTH ||
    !Number.isSafeInteger(mutation.nowMs) ||
    mutation.nowMs < 0
  ) {
    return false;
  }
  const fence = (mutation as { fence?: unknown }).fence;
  if (rule === 'required') return validFence(fence);
  if (rule === 'nullable') return fence === null || validFence(fence);
  return fence === undefined;
}

export function fenceOf(mutation: DeviceMutation): Fence | null {
  return (mutation as { fence?: Fence | null }).fence ?? null;
}

export type RecordLookup =
  | { kind: 'replay'; record: OperationRecord }
  | { kind: 'idempotency_mismatch' }
  | { kind: 'expired_idempotency' }
  | { kind: 'none' };

/** Commit rule step 1. */
export function lookupRecord(
  state: DeviceState,
  operationId: string,
  requestHash: Uint8Array
): RecordLookup {
  const record = Object.hasOwn(state.operations, operationId)
    ? state.operations[operationId]
    : undefined;
  if (record) {
    return constantTimeEqual(record.requestHash, requestHash)
      ? { kind: 'replay', record }
      : { kind: 'idempotency_mismatch' };
  }
  if (Object.hasOwn(state.expiredOperations, operationId)) {
    return { kind: 'expired_idempotency' };
  }
  return { kind: 'none' };
}

export type Reduced =
  | { commit: false; result: OperationResult }
  | {
      commit: true;
      next: DeviceState;
      result: OperationResult;
      effects: Effect[];
      raises: EpochRaise[];
      minted: MintedSecret[];
    };

function stop(reason: Parameters<typeof failure>[0]): Reduced {
  return { commit: false, result: failure(reason) };
}

type KindReducer = (
  draft: DeviceState,
  mutation: RecordedMutation,
  ctx: DeviceContext
) => Promise<KindOutcome>;

const REDUCERS: Record<RecordedKind, KindReducer> = {
  sign_in: reduceSignIn as KindReducer,
  switch: reduceSwitch as KindReducer,
  rotate: reduceRotate as KindReducer,
  record_factors: reduceRecordFactors as KindReducer,
  redeem_child: reduceRedeemChild as KindReducer,
  grant_step_up: reduceGrantStepUp as KindReducer,
  consume_step_up: reduceConsumeStepUp as KindReducer,
};

/**
 * Commit rule steps 2 and 3 for a recorded mutation against `state`, which
 * step 1 found without a record. It never mutates `state`.
 */
export async function reduceRecorded(
  state: DeviceState,
  mutation: RecordedMutation,
  ctx: DeviceContext,
  requestHash: Uint8Array
): Promise<Reduced> {
  if (isRevocation(mutation)) return stop('invalid_operation');
  const fence = fenceOf(mutation);
  const rule = FENCE_RULES[mutation.kind];
  if (rule !== 'none' && fence !== null && !fenceMatches(state, fence)) {
    return stop('superseded');
  }
  // A null-fenced sign-in comes from a request with no device cookie, which
  // reaches a new device; against any written state it is a stale page.
  if (mutation.kind === 'sign_in' && fence === null && state.version !== 0) {
    return stop('superseded');
  }
  const draft = structuredClone(state);
  ageRecords(draft, mutation.nowMs);
  if (!makeRoom(draft, mutation.nowMs)) return stop('rate_limited');
  const outcome = await REDUCERS[mutation.kind](draft, mutation, ctx);
  if (!outcome.commit) return { commit: false, result: outcome.result };
  pruneGrants(draft, mutation.nowMs);
  storeRecord(
    draft,
    mutation.operationId,
    {
      kind: mutation.kind,
      requestHash: new Uint8Array(requestHash),
      result: outcome.result,
      effects: outcome.effects,
    },
    mutation.nowMs
  );
  draft.version = state.version + 1;
  return { ...outcome, next: draft };
}
