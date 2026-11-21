/**
 * Pure expiry decisions. All times are epoch milliseconds from an injected
 * clock except where a name ends in `Seconds`. A session is expired at the
 * deadline itself, and no tolerance ever extends a deadline.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_ASSERTION_LIFETIME_SECONDS = 60;

export type ExpiryPolicy = { idleMs: number; absoluteMs: number };

export const BROWSER_EXPIRY: ExpiryPolicy = {
  idleMs: 7 * DAY_MS,
  absoluteMs: 30 * DAY_MS,
};
export const NATIVE_EXPIRY: ExpiryPolicy = {
  idleMs: 30 * DAY_MS,
  absoluteMs: 90 * DAY_MS,
};

export type SessionClocks = {
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  /** A child session's parent deadline, when it has a parent. */
  parentDeadline?: number | null;
  revokedAt?: number | null;
};

export type SessionState =
  | 'active'
  | 'invalid'
  | 'revoked'
  | 'idle_expired'
  | 'absolute_expired'
  | 'parent_expired';

export function sessionState(
  clocks: SessionClocks,
  nowMs: number
): SessionState {
  if (!validClocks(clocks) || !Number.isFinite(nowMs)) return 'invalid';
  if (clocks.revokedAt != null) return 'revoked';
  if (nowMs >= clocks.absoluteExpiresAt) return 'absolute_expired';
  if (nowMs >= clocks.idleExpiresAt) return 'idle_expired';
  if (clocks.parentDeadline != null && nowMs >= clocks.parentDeadline) {
    return 'parent_expired';
  }
  return 'active';
}

/** Clocks must be finite numbers; anything else is treated as expired. */
function validClocks(clocks: SessionClocks): boolean {
  return (
    Number.isFinite(clocks.idleExpiresAt) &&
    Number.isFinite(clocks.absoluteExpiresAt) &&
    (clocks.parentDeadline == null || Number.isFinite(clocks.parentDeadline)) &&
    (clocks.revokedAt == null || Number.isFinite(clocks.revokedAt))
  );
}

/** The earliest deadline that ends the session. */
export function sessionDeadline(clocks: SessionClocks): number {
  return Math.min(
    clocks.idleExpiresAt,
    clocks.absoluteExpiresAt,
    clocks.parentDeadline ?? Number.POSITIVE_INFINITY
  );
}

/** Clocks for a new session, with a child capped by its parent. */
export function initialClocks(
  policy: ExpiryPolicy,
  nowMs: number,
  parentDeadline?: number | null
): SessionClocks {
  const cap = parentDeadline ?? Number.POSITIVE_INFINITY;
  const absoluteExpiresAt = Math.min(nowMs + policy.absoluteMs, cap);
  return {
    idleExpiresAt: Math.min(nowMs + policy.idleMs, absoluteExpiresAt),
    absoluteExpiresAt,
    parentDeadline: parentDeadline ?? null,
  };
}

/** Slides the idle deadline on use, never past the absolute deadline. */
export function touchedIdleExpiry(
  policy: ExpiryPolicy,
  clocks: SessionClocks,
  nowMs: number
): number {
  return Math.min(nowMs + policy.idleMs, clocks.absoluteExpiresAt);
}

/**
 * The `exp` to put on an identity assertion issued at `issuedAtSeconds`, or
 * null when no assertion may be issued. The session must be active at issue
 * time. The result is capped by the 60-second lifetime, every session
 * deadline and, for a stale generation, the end of the rotation grace window,
 * which a stale request must supply.
 */
export function assertionExpiry(
  input: {
    issuedAtSeconds: number;
    clocks: SessionClocks;
  } & (
    | { stale: false; graceDeadlineMs?: never }
    | { stale: true; graceDeadlineMs: number }
  )
): number | null {
  const raw = input as { stale?: unknown; graceDeadlineMs?: unknown };
  if (typeof raw.stale !== 'boolean') return null;
  if (!raw.stale && raw.graceDeadlineMs !== undefined) return null;
  if (
    !Number.isSafeInteger(input.issuedAtSeconds) ||
    input.issuedAtSeconds < 0
  ) {
    return null;
  }
  if (sessionState(input.clocks, input.issuedAtSeconds * 1000) !== 'active') {
    return null;
  }
  const graceDeadlineMs = input.stale ? input.graceDeadlineMs : Infinity;
  if (input.stale && !Number.isFinite(graceDeadlineMs)) return null;
  const deadlineMs = Math.min(sessionDeadline(input.clocks), graceDeadlineMs);
  const expiry = Math.min(
    input.issuedAtSeconds + MAX_ASSERTION_LIFETIME_SECONDS,
    Math.floor(deadlineMs / 1000)
  );
  return expiry > input.issuedAtSeconds ? expiry : null;
}
