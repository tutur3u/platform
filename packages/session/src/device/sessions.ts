/**
 * Session row helpers: liveness, generations, revocation with its outbox
 * rows, cookie lifetimes and `touch`. Every function that changes state
 * mutates the draft it is given; the reducer owns the draft.
 */
import { encodeBase64Url } from '../encoding';
import {
  BROWSER_EXPIRY,
  type ExpiryPolicy,
  NATIVE_EXPIRY,
  sessionState,
} from '../expiry';
import { ISSUER_IDS, type IssuerId } from './registry';
import type {
  DeviceState,
  Effect,
  Entropy,
  RevocationOutbox,
  RevokeReason,
  SecretHasher,
  SessionKind,
  SessionRow,
} from './types';

export const MAX_GENERATION = 2_147_483_647;
export const GRACE_MS = 30_000;
export const SECRET_BYTES = 32;
export const ID_BYTES = 16;
/** The first drain attempt of a revocation, one minute after it. */
export const FIRST_DRAIN_DELAY_MS = 60_000;

export function emptyDeviceState(): DeviceState {
  return {
    version: 0,
    activeSid: null,
    gen: 0,
    secretHash: new Uint8Array(0),
    grace: null,
    sessions: {},
    revokedReservations: {},
    outbox: {},
    grants: {},
    operations: {},
    expiredOperations: {},
  };
}

export function policyFor(kind: SessionKind): ExpiryPolicy {
  return kind === 'browser' || kind === 'child'
    ? BROWSER_EXPIRY
    : NATIVE_EXPIRY;
}

/** The row's own clocks, plus its parent's deadline for a child. */
export function rowClocks(state: DeviceState, row: SessionRow) {
  const parent = row.parentSid ? state.sessions[row.parentSid] : undefined;
  return {
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
    parentDeadline: parent
      ? Math.min(parent.idleExpiresAt, parent.absoluteExpiresAt)
      : null,
  };
}

/**
 * Neither revoked nor expired. A child is live only while its parent row is
 * present and live too.
 */
export function isLive(
  state: DeviceState,
  row: SessionRow | undefined,
  nowMs: number
): boolean {
  if (!row || sessionState(rowClocks(state, row), nowMs) !== 'active')
    return false;
  if (row.kind !== 'child') return true;
  const parent = row.parentSid ? state.sessions[row.parentSid] : undefined;
  return (
    parent !== undefined &&
    parent.kind !== 'child' &&
    isLive(state, parent, nowMs)
  );
}

export function childrenOf(
  state: DeviceState,
  parentSid: string
): SessionRow[] {
  return Object.values(state.sessions).filter(
    (row) => row.kind === 'child' && row.parentSid === parentSid
  );
}

/** Random bytes of exactly `length` from the injected entropy, or a thrown error. */
export function draw(entropy: Entropy, length: number): Uint8Array {
  const bytes = entropy(length);
  if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
    throw new TypeError('Entropy returned the wrong length');
  }
  return new Uint8Array(bytes);
}

export function newId(entropy: Entropy): string {
  return encodeBase64Url(draw(entropy, ID_BYTES));
}

export type MintedSecret = { secret: Uint8Array; secretHash: Uint8Array };

export async function mintSecret(
  entropy: Entropy,
  hashSecret: SecretHasher
): Promise<MintedSecret> {
  const secret = draw(entropy, SECRET_BYTES);
  const secretHash = new Uint8Array(await hashSecret(secret));
  if (secretHash.length === 0) throw new TypeError('Empty secret hash');
  return { secret, secretHash };
}

/**
 * Replaces the device secret with a new generation. Only `rotate` keeps the
 * previous secret, for 30 seconds of read-only grace.
 */
export function bumpGeneration(
  draft: DeviceState,
  minted: MintedSecret,
  nowMs: number,
  keepGrace: boolean
): boolean {
  if (draft.gen >= MAX_GENERATION) return false;
  draft.grace =
    keepGrace && draft.secretHash.length > 0
      ? {
          secretHash: draft.secretHash,
          gen: draft.gen,
          deadlineMs: nowMs + GRACE_MS,
        }
      : null;
  draft.gen += 1;
  draft.secretHash = minted.secretHash;
  return true;
}

/** Whole seconds until the latest absolute deadline among the device's live non-child sessions. */
export function deviceCookieMaxAge(state: DeviceState, nowMs: number): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const row of Object.values(state.sessions)) {
    if (row.kind !== 'child' && isLive(state, row, nowMs)) {
      latest = Math.max(latest, row.absoluteExpiresAt);
    }
  }
  return Number.isFinite(latest)
    ? Math.max(0, Math.floor((latest - nowMs) / 1000))
    : 0;
}

export function setCookieEffect(state: DeviceState, nowMs: number): Effect {
  return {
    type: 'set_cookie',
    gen: state.gen,
    maxAgeSeconds: deviceCookieMaxAge(state, nowMs),
    secretHash: encodeBase64Url(state.secretHash),
  };
}

export function hasLiveDeviceSession(
  state: DeviceState,
  nowMs: number
): boolean {
  return Object.values(state.sessions).some(
    (row) => row.kind !== 'child' && isLive(state, row, nowMs)
  );
}

function issuerStates<T>(value: T): Record<IssuerId, T> {
  return Object.fromEntries(ISSUER_IDS.map((id) => [id, value])) as Record<
    IssuerId,
    T
  >;
}

/** A credential change's row: credentials effects only, keyed `<sid>:change:<at>`. */
export function credentialChangeRow(
  state: DeviceState,
  sessionId: string,
  changedAt: number
): RevocationOutbox {
  return {
    gen: state.gen,
    sessionId,
    changedAt,
    createdAt: changedAt,
    upstream: null,
    effects: {
      upstream: 'acked',
      cookie: 'acked',
      credentials: issuerStates('pending'),
    },
    attempts: { upstream: 0, credentials: issuerStates(0) },
    nextAttemptMs: changedAt + FIRST_DRAIN_DELAY_MS,
  };
}

export function changeRowKey(sessionId: string, changedAt: number): string {
  return `${sessionId}:change:${changedAt}`;
}

/**
 * Revokes `sid` and every child of it, each with its own outbox row, and
 * returns the ids it revoked. An already revoked row is left as it is. A
 * revoked active session clears `activeSid`.
 */
export function revokeSession(
  draft: DeviceState,
  sid: string,
  reason: RevokeReason,
  nowMs: number
): string[] {
  const row = draft.sessions[sid];
  if (!row) return [];
  const revoked: string[] = [];
  const revokeOne = (target: SessionRow, why: RevokeReason) => {
    if (target.revokedAt !== null) return;
    target.revokedAt = nowMs;
    target.revokedReason = why;
    // A child's upstream grant belongs to its parent.
    const upstream = target.kind === 'child' ? null : target.upstream;
    target.upstream = null;
    draft.outbox[target.sid] = {
      gen: draft.gen,
      sessionId: target.sid,
      changedAt: null,
      createdAt: nowMs,
      upstream,
      effects: {
        upstream: upstream ? 'pending' : 'acked',
        cookie: 'pending',
        credentials: issuerStates('pending'),
      },
      attempts: { upstream: 0, credentials: issuerStates(0) },
      nextAttemptMs: nowMs + FIRST_DRAIN_DELAY_MS,
    };
    revoked.push(target.sid);
  };
  revokeOne(row, reason);
  if (row.kind !== 'child') {
    for (const child of childrenOf(draft, sid)) revokeOne(child, 'parent');
  }
  if (draft.activeSid !== null && revoked.includes(draft.activeSid)) {
    draft.activeSid = null;
  }
  return revoked;
}

/** The pending effects of the outbox rows under `keys`, as a replay re-emits them. */
export function pendingOutboxEffects(
  state: DeviceState,
  keys: readonly string[]
): Effect[] {
  const effects: Effect[] = [];
  for (const key of keys) {
    const row = state.outbox[key];
    if (!row) continue;
    if (row.effects.upstream === 'pending' && row.upstream) {
      effects.push({
        type: 'revoke_upstream',
        outboxKey: key,
        grant: row.upstream,
      });
    }
    for (const issuer of ISSUER_IDS) {
      // A missing key counts as pending.
      if ((row.effects.credentials[issuer] ?? 'pending') === 'pending') {
        effects.push({
          type: 'revoke_credentials',
          outboxKey: key,
          sessionId: row.sessionId,
          issuer,
          before: row.changedAt,
        });
      }
    }
  }
  return effects;
}

export function revokedAuditEffects(
  state: DeviceState,
  revoked: readonly string[]
): Effect[] {
  return revoked.map((sid) => ({
    type: 'audit' as const,
    event: 'session.revoked' as const,
    sessionId: sid,
    userId: state.sessions[sid]?.userId ?? null,
    reason: state.sessions[sid]?.revokedReason ?? undefined,
  }));
}

export const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * The row after `touch` at `lastSeenAtMs`: the idle deadline slides, never
 * past the absolute deadline, and a child's never past its parent's. A
 * revoked or expired row is unchanged.
 */
export function touchedSession(
  state: DeviceState,
  sid: string,
  lastSeenAtMs: number
): SessionRow | null {
  const row = state.sessions[sid];
  if (!row || !isLive(state, row, lastSeenAtMs)) return null;
  let idle = Math.min(
    lastSeenAtMs + policyFor(row.kind).idleMs,
    row.absoluteExpiresAt
  );
  const parent = row.parentSid ? state.sessions[row.parentSid] : undefined;
  if (parent)
    idle = Math.min(idle, parent.idleExpiresAt, parent.absoluteExpiresAt);
  return {
    ...row,
    lastSeenAt: Math.max(row.lastSeenAt, lastSeenAtMs),
    idleExpiresAt: Math.max(row.idleExpiresAt, idle),
  };
}
