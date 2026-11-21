/**
 * The revocation outbox: cookie effects settled on the next response, the
 * drain's retry schedule with per-effect attempts and terminal `abandoned`,
 * and the prune rules. Everything here is pure over a draft; `drain.ts`
 * runs it against the ports.
 */
import { ISSUER_IDS, type IssuerId } from './registry';
import { hasLiveDeviceSession, isLive } from './sessions';
import type { DeviceState, RevocationOutbox } from './types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Delay before drain attempt n + 1, after n failures. */
export const DRAIN_DELAYS_MS = Object.freeze([
  MINUTE,
  15 * MINUTE,
  60 * MINUTE,
  6 * 60 * MINUTE,
  DAY,
]);
/** The fifth failed drain attempt abandons the effect. */
export const MAX_DRAIN_ATTEMPTS = DRAIN_DELAYS_MS.length;
export const REVOKED_ROW_RETENTION_MS = 7 * DAY;
export const REVOKED_RESERVATION_RETENTION_MS = 30 * DAY;

/**
 * `clear` emits `Max-Age=0`; `keep` leaves the current cookie as it is,
 * because the device still has a live session at this generation.
 */
export type CookieDirective = 'clear' | 'keep';
export type CookieScope =
  | { kind: 'device' }
  | { kind: 'child'; sessionId: string };

function inScope(
  state: DeviceState,
  row: RevocationOutbox,
  scope: CookieScope
): boolean {
  if (row.changedAt !== null) return false;
  const session = state.sessions[row.sessionId];
  if (scope.kind === 'child') return row.sessionId === scope.sessionId;
  return session?.kind !== 'child';
}

/** The directive for `scope`, from the device's live sessions at `nowMs`. */
function directiveFor(
  state: DeviceState,
  nowMs: number,
  scope: CookieScope
): CookieDirective {
  if (scope.kind === 'child') {
    return isLive(state, state.sessions[scope.sessionId], nowMs)
      ? 'keep'
      : 'clear';
  }
  return hasLiveDeviceSession(state, nowMs) ? 'keep' : 'clear';
}

/**
 * Settles every pending cookie effect in `scope` on a response to it. A row
 * whose generation the device has moved past is `superseded` and leaves the
 * current cookie alone; otherwise it is `acked` with the directive. Returns
 * null when nothing was pending, so the response sets no cookie.
 */
export function settleCookies(
  draft: DeviceState,
  nowMs: number,
  scope: CookieScope
): CookieDirective | null {
  let directive: CookieDirective | null = null;
  for (const row of Object.values(draft.outbox)) {
    if (row.effects.cookie !== 'pending' || !inScope(draft, row, scope))
      continue;
    if (row.gen !== draft.gen) {
      row.effects.cookie = 'superseded';
      continue;
    }
    row.effects.cookie = 'acked';
    directive = directiveFor(draft, nowMs, scope);
  }
  return directive;
}

/** Whether any pending cookie effect would settle on a response to `scope`. */
export function hasPendingCookie(
  state: DeviceState,
  scope: CookieScope
): boolean {
  return Object.values(state.outbox).some(
    (row) => row.effects.cookie === 'pending' && inScope(state, row, scope)
  );
}

/**
 * The directive a logout response carries when its own committed write lost
 * its acknowledgement: the generation rule alone, whatever the ack state.
 */
export function cookieDirectiveFor(
  state: DeviceState,
  nowMs: number,
  scope: CookieScope,
  keys: readonly string[]
): CookieDirective | null {
  const rows = keys
    .map((key) => state.outbox[key])
    .filter((row) => row !== undefined);
  if (rows.length === 0 || rows.some((row) => row.gen !== state.gen))
    return null;
  return directiveFor(state, nowMs, scope);
}

export type DrainTask =
  | { key: string; effect: 'upstream' }
  | {
      key: string;
      effect: 'credentials';
      issuer: IssuerId;
      sessionId: string;
      before: number | null;
    };

const credentialState = (row: RevocationOutbox, issuer: IssuerId) =>
  row.effects.credentials[issuer] ?? 'pending';

export function hasPendingDrainEffects(row: RevocationOutbox): boolean {
  return (
    row.effects.upstream === 'pending' ||
    ISSUER_IDS.some((issuer) => credentialState(row, issuer) === 'pending')
  );
}

/** The `upstream` and `credentials` effects due at `nowMs`. The alarm never counts cookies. */
export function planDrain(state: DeviceState, nowMs: number): DrainTask[] {
  const tasks: DrainTask[] = [];
  for (const [key, row] of Object.entries(state.outbox)) {
    if (row.nextAttemptMs > nowMs) continue;
    if (row.effects.upstream === 'pending' && row.upstream)
      tasks.push({ key, effect: 'upstream' });
    for (const issuer of ISSUER_IDS) {
      if (credentialState(row, issuer) === 'pending') {
        tasks.push({
          key,
          effect: 'credentials',
          issuer,
          sessionId: row.sessionId,
          before: row.changedAt,
        });
      }
    }
  }
  return tasks;
}

export type EffectResult = DrainTask & { ok: boolean };
export type DrainAlert = { key: string; effect: 'upstream' | IssuerId };

/**
 * Applies effect results to a draft. A success acknowledges the effect; a
 * failure counts only when `countAttempts` (the drain alarm), and the fifth
 * counted failure abandons that effect alone. Results for an effect no
 * longer pending are ignored.
 */
export function applyEffectResults(
  draft: DeviceState,
  results: readonly EffectResult[],
  nowMs: number,
  countAttempts: boolean
): DrainAlert[] {
  const alerts: DrainAlert[] = [];
  const touched = new Set<string>();
  for (const result of results) {
    const row = draft.outbox[result.key];
    if (!row) continue;
    // A drain write that committed but lost its acknowledgement already
    // counted this row's failures and moved it past `nowMs`; a retry of that
    // write never counts them twice.
    if (!result.ok && countAttempts && row.nextAttemptMs > nowMs) continue;
    if (result.effect === 'upstream') {
      if (row.effects.upstream !== 'pending') continue;
      if (result.ok) {
        row.effects.upstream = 'acked';
        row.upstream = null;
      } else if (countAttempts) {
        row.attempts.upstream += 1;
        if (row.attempts.upstream >= MAX_DRAIN_ATTEMPTS) {
          row.effects.upstream = 'abandoned';
          row.upstream = null;
          alerts.push({ key: result.key, effect: 'upstream' });
        }
      }
    } else {
      if (credentialState(row, result.issuer) !== 'pending') continue;
      if (result.ok) {
        row.effects.credentials[result.issuer] = 'acked';
      } else if (countAttempts) {
        const attempts = (row.attempts.credentials[result.issuer] ?? 0) + 1;
        row.attempts.credentials[result.issuer] = attempts;
        if (attempts >= MAX_DRAIN_ATTEMPTS) {
          row.effects.credentials[result.issuer] = 'abandoned';
          alerts.push({ key: result.key, effect: result.issuer });
        }
      }
    }
    if (countAttempts) touched.add(result.key);
  }
  for (const key of touched) {
    const row = draft.outbox[key];
    if (!row || !hasPendingDrainEffects(row)) continue;
    const counts = [
      ...(row.effects.upstream === 'pending' ? [row.attempts.upstream] : []),
      ...ISSUER_IDS.filter(
        (issuer) => credentialState(row, issuer) === 'pending'
      ).map((issuer) => row.attempts.credentials[issuer] ?? 0),
    ];
    const fewest = Math.min(...counts);
    row.nextAttemptMs = nowMs + (DRAIN_DELAYS_MS[fewest] ?? DAY);
  }
  return alerts;
}

/**
 * The drain alarm's prune: a revoked session and its outbox row once
 * nothing but a cookie is pending and 7 days have passed; a credential-change
 * row once no credentials effect is pending; expired child rows that were
 * never revoked; slot ids after 30 days; grants of another generation or
 * past expiry. Returns whether anything changed.
 */
export function prune(draft: DeviceState, nowMs: number): boolean {
  let changed = false;
  for (const [key, row] of Object.entries(draft.outbox)) {
    if (row.changedAt === null || hasPendingDrainEffects(row)) continue;
    delete draft.outbox[key];
    changed = true;
  }
  for (const [sid, session] of Object.entries(draft.sessions)) {
    if (session.revokedAt === null) {
      if (session.kind === 'child' && !isLive(draft, session, nowMs)) {
        delete draft.sessions[sid];
        changed = true;
      }
      continue;
    }
    const row = draft.outbox[sid];
    if (row && hasPendingDrainEffects(row)) continue;
    if (nowMs < session.revokedAt + REVOKED_ROW_RETENTION_MS) continue;
    delete draft.sessions[sid];
    delete draft.outbox[sid];
    changed = true;
  }
  for (const [id, at] of Object.entries(draft.revokedReservations)) {
    if (nowMs >= at + REVOKED_RESERVATION_RETENTION_MS) {
      delete draft.revokedReservations[id];
      changed = true;
    }
  }
  changed = pruneGrants(draft, nowMs) || changed;
  return changed;
}

/** Drops grants a generation bump or expiry has made unusable. */
export function pruneGrants(draft: DeviceState, nowMs: number): boolean {
  let changed = false;
  for (const [id, grant] of Object.entries(draft.grants)) {
    if (grant.gen !== draft.gen || nowMs >= grant.expiresAtMs) {
      delete draft.grants[id];
      changed = true;
    }
  }
  return changed;
}
