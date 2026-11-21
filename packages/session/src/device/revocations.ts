/**
 * Logout and the two system revokes. They skip the operation map: the
 * outbox row is their committed record, so they ignore `operationId`, never
 * add or evict a record and are never rate limited. A replay of an already
 * revoked session changes nothing and emits only pending effects.
 */
import { validEpoch } from './epoch';
import { revokeSession } from './sessions';
import { settleCookies, type CookieDirective } from './outbox';
import type {
  DeviceState,
  EpochRaise,
  Fence,
  MutationOf,
  SessionRow,
} from './types';

export type RevocationMutation = MutationOf<
  'revoke' | 'revoke_user_below_epoch' | 'revoke_user_on_device'
>;

export type RevocationPlan =
  | { kind: 'fail'; reason: 'superseded' | 'invalid_operation' | 'not_found' }
  | {
      kind: 'done';
      alreadyRevoked: boolean;
      /** Sessions this plan revokes now. */
      revoked: string[];
      /** Outbox rows whose pending effects the result emits. */
      keys: string[];
      /** Null when the state is unchanged (a replay or a raise-only write). */
      next: DeviceState | null;
      raises: EpochRaise[];
      /** Set for a logout, whose own response carries the cookie. */
      cookie: CookieDirective | null;
    };

export function isRevocation(mutation: {
  kind: string;
}): mutation is RevocationMutation {
  return (
    mutation.kind === 'revoke' ||
    mutation.kind === 'revoke_user_below_epoch' ||
    mutation.kind === 'revoke_user_on_device'
  );
}

export function fenceMatches(state: DeviceState, fence: Fence): boolean {
  return (
    fence.sessionId === state.activeSid &&
    fence.gen === state.gen &&
    fence.version === state.version
  );
}

function withChildren(state: DeviceState, row: SessionRow): string[] {
  const keys = [row.sid];
  if (row.kind !== 'child') {
    for (const other of Object.values(state.sessions)) {
      if (other.kind === 'child' && other.parentSid === row.sid)
        keys.push(other.sid);
    }
  }
  return keys;
}

function commitDraft(state: DeviceState): DeviceState {
  const draft = structuredClone(state);
  draft.version = state.version + 1;
  return draft;
}

function planRevoke(
  state: DeviceState,
  mutation: MutationOf<'revoke'>
): RevocationPlan {
  const { sessionId, fence, nowMs } = mutation;
  const row =
    typeof sessionId === 'string' && Object.hasOwn(state.sessions, sessionId)
      ? state.sessions[sessionId]
      : undefined;
  if (!row) return { kind: 'fail', reason: 'not_found' };
  const isLogout = fence === null;
  const scope =
    row.kind === 'child'
      ? ({ kind: 'child', sessionId } as const)
      : ({ kind: 'device' } as const);
  if (row.revokedAt !== null) {
    return {
      kind: 'done',
      alreadyRevoked: true,
      revoked: [],
      keys: withChildren(state, row),
      next: null,
      raises: [],
      cookie: null,
    };
  }
  if (isLogout) {
    // A null fence is only the caller's own session: the active one or a child host's.
    if (sessionId !== state.activeSid && row.kind !== 'child') {
      return { kind: 'fail', reason: 'invalid_operation' };
    }
  } else if (!fenceMatches(state, fence)) {
    return { kind: 'fail', reason: 'superseded' };
  }
  const next = commitDraft(state);
  const revoked = revokeSession(next, sessionId, mutation.reason, nowMs);
  // The logout response is the next response to this device.
  const cookie = isLogout ? settleCookies(next, nowMs, scope) : null;
  return {
    kind: 'done',
    alreadyRevoked: false,
    revoked,
    keys: revoked,
    next,
    raises: [],
    cookie,
  };
}

function planBelowEpoch(
  state: DeviceState,
  mutation: MutationOf<'revoke_user_below_epoch'>
): RevocationPlan {
  const { userId, belowEpoch, bumpedAtMs, nowMs } = mutation;
  if (
    typeof userId !== 'string' ||
    !validEpoch(belowEpoch) ||
    !Number.isFinite(bumpedAtMs)
  ) {
    return { kind: 'fail', reason: 'invalid_operation' };
  }
  // The cache takes the bump's own time, never the delivery time.
  const raises: EpochRaise[] = [
    { userId, epoch: belowEpoch, readAtMs: bumpedAtMs },
  ];
  // Exclusive: a session created at or after the bump is never revoked by it.
  const below = Object.values(state.sessions).filter(
    (row) => row.userId === userId && row.epochSeen < belowEpoch
  );
  const keys = below.map((row) => row.sid);
  const live = below.filter((row) => row.revokedAt === null);
  if (live.length === 0) {
    return {
      kind: 'done',
      alreadyRevoked: keys.length > 0,
      revoked: [],
      keys,
      next: null,
      raises,
      cookie: null,
    };
  }
  const next = commitDraft(state);
  const revoked: string[] = [];
  for (const row of live)
    revoked.push(...revokeSession(next, row.sid, 'epoch', nowMs));
  return {
    kind: 'done',
    alreadyRevoked: false,
    revoked,
    keys,
    next,
    raises,
    cookie: null,
  };
}

function planOnDevice(
  state: DeviceState,
  mutation: MutationOf<'revoke_user_on_device'>
): RevocationPlan {
  const { userId, reservationId, nowMs } = mutation;
  if (
    typeof userId !== 'string' ||
    typeof reservationId !== 'string' ||
    reservationId === ''
  ) {
    return { kind: 'fail', reason: 'invalid_operation' };
  }
  // Only sessions admitted under the named slot, so a redelivery spares later sign-ins.
  const matches = Object.values(state.sessions).filter(
    (row) => row.userId === userId && row.reservationId === reservationId
  );
  const keys = matches.map((row) => row.sid);
  if (Object.hasOwn(state.revokedReservations, reservationId)) {
    return {
      kind: 'done',
      alreadyRevoked: true,
      revoked: [],
      keys,
      next: null,
      raises: [],
      cookie: null,
    };
  }
  if (matches.length === 0) return { kind: 'fail', reason: 'not_found' };
  const next = commitDraft(state);
  const revoked: string[] = [];
  for (const row of matches) {
    if (next.sessions[row.sid]?.revokedAt === null) {
      revoked.push(...revokeSession(next, row.sid, 'evicted', nowMs));
    }
  }
  next.revokedReservations[reservationId] = nowMs;
  return {
    kind: 'done',
    alreadyRevoked: false,
    revoked,
    keys,
    next,
    raises: [],
    cookie: null,
  };
}

/** The plan for one revocation against `state`. Pure; the commit loop writes it. */
export function planRevocation(
  state: DeviceState,
  mutation: RevocationMutation
): RevocationPlan {
  switch (mutation.kind) {
    case 'revoke':
      return planRevoke(state, mutation);
    case 'revoke_user_below_epoch':
      return planBelowEpoch(state, mutation);
    case 'revoke_user_on_device':
      return planOnDevice(state, mutation);
  }
}

/** Whether the mutation's revocation is visible in `state`, for the final confirming read. */
export function revocationVisible(
  state: DeviceState,
  mutation: RevocationMutation
): boolean {
  const plan = planRevocation(state, mutation);
  if (plan.kind !== 'done') return false;
  if (mutation.kind === 'revoke_user_below_epoch') return plan.next === null;
  return plan.alreadyRevoked;
}
