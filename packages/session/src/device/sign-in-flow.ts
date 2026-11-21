/**
 * The device-cap flow around `sign_in`: reserve a slot in the user index
 * before reducing, commit, then settle this operation's claim. A success
 * confirms it. Any other definite result reads the stored record first: a
 * `succeeded` record (an `idempotency_mismatch` retry of a committed
 * sign-in) confirms the slot it was admitted under and is never released;
 * otherwise the claim is released. An `unavailable` commit, or a failed
 * read, settles nothing; the index lease asks `leaseDecision` and decides,
 * so a committed sign-in whose acknowledgement was lost is still confirmed.
 */
import { commitMutation, type CommitDeps, type CommitOutcome } from './commit';
import { failure } from './reduce-common';
import type {
  DeviceMutation,
  DeviceState,
  DeviceStore,
  MutationOf,
  ReservationClaim,
  UserIndexPort,
} from './types';

export type SignInRequest = Omit<
  MutationOf<'sign_in'>,
  'kind' | 'reservation' | 'eviction'
> & { deviceId: string; cap: number };

function uncommitted(reason: 'retry_later' | 'unavailable'): CommitOutcome {
  return {
    result: failure(reason),
    effects: [],
    cookie: null,
    replayed: false,
  };
}

/** The slot a stored `succeeded` sign-in was admitted under, or null. */
function admittedReservation(
  state: DeviceState,
  operationId: string
): string | null {
  const record = Object.hasOwn(state.operations, operationId)
    ? state.operations[operationId]
    : undefined;
  if (!record || record.kind !== 'sign_in' || !record.result.ok) return null;
  for (const effect of record.effects) {
    if (effect.type === 'index_confirm') return effect.reservationId;
  }
  return null;
}

async function readState(store: DeviceStore): Promise<DeviceState | null> {
  try {
    return await store.read();
  } catch {
    return null;
  }
}

/** Settles a claim whose commit returned a definite failure. */
async function settleFailure(
  deps: CommitDeps & { index: UserIndexPort },
  claim: ReservationClaim
): Promise<void> {
  const state = await readState(deps.store);
  // Without a read the lease settles the claim.
  if (!state) return;
  const admitted = admittedReservation(state, claim.operationId);
  if (admitted !== null) {
    await deps.index.confirm({
      reservationId: admitted,
      operationId: claim.operationId,
    });
  }
  // A claim on the slot a committed sign-in holds is never released.
  if (admitted !== claim.reservationId) await deps.index.release(claim);
}

export async function signInWithReservation(
  deps: CommitDeps & { index: UserIndexPort },
  request: SignInRequest
): Promise<CommitOutcome> {
  const { deviceId, cap, ...rest } = request;
  let reserved: Awaited<ReturnType<UserIndexPort['reserve']>>;
  try {
    reserved = await deps.index.reserve({
      userId: rest.outcome.userId,
      deviceId,
      operationId: rest.operationId,
      cap,
      nowMs: rest.nowMs,
    });
  } catch {
    return uncommitted('unavailable');
  }
  if (reserved.kind === 'evicting') return uncommitted('retry_later');
  if (reserved.kind === 'unavailable') return uncommitted('unavailable');
  const claim: ReservationClaim = {
    reservationId: reserved.reservation.reservationId,
    operationId: rest.operationId,
  };
  const mutation: DeviceMutation = {
    ...rest,
    kind: 'sign_in',
    reservation: { reservationId: claim.reservationId },
    eviction:
      reserved.kind === 'swap'
        ? {
            deviceId: reserved.evictDeviceId,
            reservationId: reserved.evictReservationId,
          }
        : null,
  };
  const outcome = await commitMutation(deps, mutation);
  try {
    if (outcome.result.ok) await deps.index.confirm(claim);
    else if (outcome.result.reason !== 'unavailable') {
      await settleFailure(deps, claim);
    }
  } catch {
    // The 60-second lease settles a lost confirm or release.
  }
  return outcome;
}

/**
 * The index lease's decision for one claim on expiry: confirm only when its
 * operation is a `succeeded` sign-in admitted under the claimed slot; release
 * a `rejected`, `expired` or `absent` one, or one admitted under another slot.
 */
export async function leaseDecision(
  store: DeviceStore,
  claim: ReservationClaim
): Promise<'confirm' | 'release' | 'unknown'> {
  const state = await readState(store);
  if (!state) return 'unknown';
  return admittedReservation(state, claim.operationId) === claim.reservationId
    ? 'confirm'
    : 'release';
}
