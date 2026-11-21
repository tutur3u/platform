/**
 * The device-cap flow around `sign_in`: reserve a slot in the user index
 * before reducing, commit, then confirm on success or release on a definite
 * failure. An `unavailable` commit neither confirms nor releases; the index
 * lease asks `operationStatus` and decides, so a committed sign-in whose
 * acknowledgement was lost is still confirmed.
 */
import { commitMutation, type CommitDeps, type CommitOutcome } from './commit';
import { failure } from './reduce-common';
import { operationStatus } from './records';
import type {
  DeviceMutation,
  DeviceStore,
  MutationOf,
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
  const mutation: DeviceMutation = {
    ...rest,
    kind: 'sign_in',
    reservation: { reservationId: reserved.reservation.reservationId },
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
    if (outcome.result.ok) await deps.index.confirm(reserved.reservation);
    else if (outcome.result.reason !== 'unavailable') {
      // A definite failure: drop the reservation and restore any swap victim.
      await deps.index.release(reserved.reservation);
    }
  } catch {
    // The 60-second lease settles a lost confirm or release.
  }
  return outcome;
}

/**
 * The index lease's decision on expiry: confirm only a `succeeded` sign-in,
 * release a `rejected`, `expired` or `absent` one.
 */
export async function leaseDecision(
  store: DeviceStore,
  operationId: string
): Promise<'confirm' | 'release' | 'unknown'> {
  try {
    return operationStatus(await store.read(), operationId) === 'succeeded'
      ? 'confirm'
      : 'release';
  } catch {
    return 'unknown';
  }
}
