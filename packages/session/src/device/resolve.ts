/**
 * `resolve`: a pure read of which session a request's secret names and
 * whether the route may use it. It never records an operation, never bumps
 * `version` and never writes; the host refreshes the epoch cache and calls
 * `touch` from what it returns.
 */
import type { AssuranceLevel, AuthMethod, UserId } from '../principal';
import { constantTimeEqual } from '../encoding';
import { checkEpochRead, EPOCH_CACHE_MAX_AGE_MS } from './epoch';
import type { RouteClass, RouteId, RouteRegistry } from './registry';
import { isLive, TOUCH_INTERVAL_MS } from './sessions';
import type { DeviceState, EpochCache, EpochRead, SessionRow } from './types';

export type ResolveInput = {
  /** The keyed hash of the request cookie's secret. */
  secretHash: Uint8Array;
  route: RouteId;
  expectedSessionId: string | null;
  /** A fresh read, when the host made one; required unless a young cache entry serves a `read`. */
  epoch: EpochRead | null;
  epochCache: EpochCache;
  nowMs: number;
};

export type ResolveResult =
  | {
      kind: 'resolved';
      sessionId: string;
      userId: UserId;
      gen: number;
      routeClass: RouteClass;
      /** The previous generation during rotation grace: read authority only. */
      stale: boolean;
      /** The grace deadline that caps a stale assertion, otherwise null. */
      graceDeadlineMs: number | null;
      clocks: {
        idleExpiresAt: number;
        absoluteExpiresAt: number;
        parentDeadline: number | null;
      };
      aal: AssuranceLevel;
      amr: readonly AuthMethod[];
      authTime: number;
      /** The device clock time of this resolution, the `resolvedAtMs` an issuer receives. */
      resolvedAtMs: number;
      /** The fresh read to pass to `refreshEpochCache`, outside the device version. */
      refreshEpoch: EpochRead | null;
      /** Whether the host should `touch` this session now. */
      touch: boolean;
    }
  | {
      kind: 'signed_out';
      epochRevoke: {
        userId: UserId;
        belowEpoch: number;
        bumpedAtMs: number;
      } | null;
    }
  | { kind: 'rotated' }
  | { kind: 'account_mismatch' }
  | { kind: 'epoch_unavailable' }
  | { kind: 'invalid_operation' };

type Match = {
  row: SessionRow;
  stale: boolean;
  graceDeadlineMs: number | null;
};

function matchSecret(
  state: DeviceState,
  secretHash: Uint8Array,
  nowMs: number
): Match | null {
  if (!(secretHash instanceof Uint8Array) || secretHash.length === 0)
    return null;
  // Every candidate is compared, so timing does not reveal which one matched.
  const current =
    state.secretHash.length > 0 &&
    constantTimeEqual(secretHash, state.secretHash);
  const grace =
    state.grace !== null &&
    nowMs < state.grace.deadlineMs &&
    constantTimeEqual(secretHash, state.grace.secretHash);
  let child: SessionRow | null = null;
  for (const row of Object.values(state.sessions)) {
    if (
      row.childSecretHash &&
      constantTimeEqual(secretHash, row.childSecretHash)
    )
      child = row;
  }
  const active = state.activeSid ? state.sessions[state.activeSid] : undefined;
  if (current)
    return active ? { row: active, stale: false, graceDeadlineMs: null } : null;
  if (grace && state.grace) {
    return active
      ? { row: active, stale: true, graceDeadlineMs: state.grace.deadlineMs }
      : null;
  }
  return child ? { row: child, stale: false, graceDeadlineMs: null } : null;
}

const SIGNED_OUT: ResolveResult = { kind: 'signed_out', epochRevoke: null };

export function resolve(
  state: DeviceState,
  input: ResolveInput,
  registry: RouteRegistry
): ResolveResult {
  const { nowMs } = input;
  const match = matchSecret(state, input.secretHash, nowMs);
  if (!match) return SIGNED_OUT;
  const declaration = registry.get(input.route);
  if (match.stale && declaration.class !== 'read') return { kind: 'rotated' };
  const { row } = match;
  // Revocation and expiry come before any epoch check.
  if (!isLive(state, row, nowMs)) return SIGNED_OUT;
  if (declaration.accountScoped && input.expectedSessionId === null) {
    return { kind: 'account_mismatch' };
  }
  if (input.expectedSessionId !== null && input.expectedSessionId !== row.sid) {
    return { kind: 'account_mismatch' };
  }

  let epoch: number | null = null;
  let refreshEpoch: EpochRead | null = null;
  if (input.epoch) {
    const checked = checkEpochRead(input.epoch, row.userId, nowMs);
    if (!checked.ok && checked.reason === 'invalid_operation') {
      return { kind: 'invalid_operation' };
    }
    if (checked.ok) {
      epoch = checked.epoch;
      refreshEpoch = input.epoch;
    }
  }
  const cached = Object.hasOwn(input.epochCache, row.userId)
    ? input.epochCache[row.userId]
    : undefined;
  if (
    declaration.class === 'read' &&
    cached &&
    cached.readAtMs <= nowMs &&
    nowMs - cached.readAtMs <= EPOCH_CACHE_MAX_AGE_MS
  ) {
    epoch = Math.max(epoch ?? cached.epoch, cached.epoch);
  }
  if (epoch === null) return { kind: 'epoch_unavailable' };
  if (row.epochSeen < epoch) {
    return {
      kind: 'signed_out',
      epochRevoke: {
        userId: row.userId,
        belowEpoch: epoch,
        bumpedAtMs: refreshEpoch?.readAtMs ?? (cached?.readAtMs as number),
      },
    };
  }
  const parent = row.parentSid ? state.sessions[row.parentSid] : undefined;
  return {
    kind: 'resolved',
    sessionId: row.sid,
    userId: row.userId,
    gen: match.stale ? (state.grace?.gen ?? state.gen) : state.gen,
    routeClass: declaration.class,
    stale: match.stale,
    graceDeadlineMs: match.graceDeadlineMs,
    clocks: {
      idleExpiresAt: row.idleExpiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      parentDeadline: parent
        ? Math.min(parent.idleExpiresAt, parent.absoluteExpiresAt)
        : null,
    },
    aal: row.aal,
    amr: [...row.amr],
    authTime: row.authTime,
    resolvedAtMs: nowMs,
    refreshEpoch,
    // The grace secret never extends expiry.
    touch: !match.stale && nowMs - row.lastSeenAt >= TOUCH_INTERVAL_MS,
  };
}
