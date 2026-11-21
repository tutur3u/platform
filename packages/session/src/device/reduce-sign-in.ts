/**
 * `sign_in`: admits a new session under the index reservation the host
 * obtained, after the epoch capture and second-factor rules. A rejection is
 * stored as a record that changes no session, so the index lease sees it as
 * `rejected` and releases the reservation.
 */
import { AUTH_METHODS } from '../auth-methods';
import { initialClocks } from '../expiry';
import { checkEpochRead, checkFactorRead } from './epoch';
import {
  type DeviceContext,
  failure,
  type KindOutcome,
  noCommit,
  revocationEffects,
  success,
} from './reduce-common';
import {
  bumpGeneration,
  isLive,
  mintSecret,
  newId,
  policyFor,
  revokeSession,
  setCookieEffect,
} from './sessions';
import type {
  DeviceState,
  Effect,
  FailureReason,
  MutationOf,
  SessionFactor,
  SignInOutcome,
} from './types';

const SESSION_KINDS = new Set(['browser', 'mobile', 'cli', 'external_app']);

function validOutcome(outcome: SignInOutcome): boolean {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    outcome.kind === 'authenticated' &&
    typeof outcome.userId === 'string' &&
    outcome.userId.length > 0 &&
    typeof outcome.provider === 'string' &&
    typeof outcome.providerSubject === 'string' &&
    (outcome.aal === 'aal1' || outcome.aal === 'aal2') &&
    Array.isArray(outcome.amr) &&
    outcome.amr.length > 0 &&
    outcome.amr.every((method) => AUTH_METHODS.includes(method)) &&
    new Set(outcome.amr).size === outcome.amr.length &&
    typeof outcome.passkeyUserVerified === 'boolean' &&
    SESSION_KINDS.has(outcome.sessionKind)
  );
}

/**
 * Whether the sign-in presented what the enrolled factors require. A
 * passkey satisfies an enrolled second factor only with user verification.
 */
function factorDecision(
  outcome: SignInOutcome,
  factors: readonly SessionFactor[]
):
  | { ok: true; secondFactorSatisfied: boolean }
  | { ok: false; reason: FailureReason } {
  const amr = new Set(outcome.amr);
  const hasMethod = (method: 'totp' | 'passkey') =>
    factors.some((factor) => factor.method === method);
  if (
    (amr.has('totp') && !hasMethod('totp')) ||
    (amr.has('passkey') && !hasMethod('passkey'))
  ) {
    return { ok: false, reason: 'factor_mismatch' };
  }
  const presentedTotp =
    amr.has('totp') &&
    factors.some(
      (factor) => factor.method === 'totp' && factor.role === 'second_factor'
    );
  const presentedUvPasskey =
    amr.has('passkey') && outcome.passkeyUserVerified === true;
  const satisfied = presentedTotp || presentedUvPasskey;
  if (factors.some((factor) => factor.role === 'second_factor') && !satisfied) {
    return { ok: false, reason: 'second_factor_required' };
  }
  return { ok: true, secondFactorSatisfied: satisfied };
}

function rejected(
  draft: DeviceState,
  mutation: MutationOf<'sign_in'>,
  reason: FailureReason,
  raise: { userId: SignInOutcome['userId']; epoch: number; readAtMs: number }
): KindOutcome {
  const { userId } = mutation.outcome;
  return {
    commit: true,
    result: failure(reason),
    effects: [
      {
        type: 'index_release',
        userId,
        reservationId: mutation.reservation.reservationId,
      },
      {
        type: 'audit',
        event: 'session.sign_in_rejected',
        sessionId: null,
        userId,
        reason,
      },
    ],
    raises: [raise],
    minted: [],
  };
}

export async function reduceSignIn(
  draft: DeviceState,
  mutation: MutationOf<'sign_in'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const { outcome, reservation, eviction, nowMs } = mutation;
  if (!validOutcome(outcome)) return noCommit('invalid_operation');
  const reservationId = reservation?.reservationId;
  if (typeof reservationId !== 'string' || reservationId.length === 0) {
    return noCommit('invalid_operation');
  }
  // A slot this device already revoked is never admitted again.
  if (Object.hasOwn(draft.revokedReservations, reservationId)) {
    return noCommit('invalid_operation');
  }
  if (
    eviction !== null &&
    (typeof eviction?.deviceId !== 'string' ||
      typeof eviction.reservationId !== 'string')
  ) {
    return noCommit('invalid_operation');
  }
  const epoch = checkEpochRead(mutation.epoch, outcome.userId, nowMs);
  if (!epoch.ok) return noCommit(epoch.reason);
  const factors = checkFactorRead(mutation.factors, outcome.userId, nowMs);
  if (!factors.ok) return noCommit(factors.reason);

  if (mutation.capturedEpoch !== epoch.epoch) {
    return rejected(draft, mutation, 'credentials_changed', epoch.raise);
  }
  const decision = factorDecision(outcome, factors.factors);
  if (!decision.ok)
    return rejected(draft, mutation, decision.reason, epoch.raise);

  const previousActive = draft.activeSid;
  // One live session per user per device: a new sign-in replaces the old one.
  const replaced: string[] = [];
  for (const row of Object.values(draft.sessions)) {
    if (
      row.userId === outcome.userId &&
      row.kind !== 'child' &&
      row.revokedAt === null
    ) {
      replaced.push(...revokeSession(draft, row.sid, 'replaced', nowMs));
    }
  }
  const minted = await mintSecret(ctx.entropy, ctx.hashSecret);
  let sid = newId(ctx.entropy);
  while (Object.hasOwn(draft.sessions, sid)) sid = newId(ctx.entropy);
  const clocks = initialClocks(policyFor(outcome.sessionKind), nowMs);
  draft.sessions[sid] = {
    sid,
    userId: outcome.userId,
    kind: outcome.sessionKind,
    parentSid: null,
    host: null,
    callback: null,
    createdAt: nowMs,
    lastSeenAt: nowMs,
    idleExpiresAt: clocks.idleExpiresAt,
    absoluteExpiresAt: clocks.absoluteExpiresAt,
    authTime: nowMs,
    aal: outcome.aal,
    amr: [...outcome.amr],
    provider: outcome.provider,
    providerSubject: outcome.providerSubject,
    upstream: outcome.grant ?? null,
    epochSeen: epoch.epoch,
    revokedAt: null,
    revokedReason: null,
    reservationId,
    factors: factors.factors,
    secondFactorSatisfied: decision.secondFactorSatisfied,
    childSecretHash: null,
  };
  draft.activeSid = sid;
  if (!bumpGeneration(draft, minted, nowMs, false))
    return noCommit('invalid_operation');
  if (!isLive(draft, draft.sessions[sid], nowMs))
    return noCommit('invalid_operation');

  const effects: Effect[] = [
    setCookieEffect(draft, nowMs),
    {
      type: 'audit',
      event: 'session.created',
      sessionId: sid,
      userId: outcome.userId,
    },
    { type: 'index_confirm', userId: outcome.userId, reservationId },
  ];
  if (eviction) {
    effects.push({
      type: 'evict_device',
      userId: outcome.userId,
      deviceId: eviction.deviceId,
      reservationId: eviction.reservationId,
    });
  }
  if (previousActive !== null && previousActive !== sid) {
    effects.push({ type: 'tab_invalidate', sessionId: previousActive });
  }
  effects.push(...revocationEffects(draft, replaced));
  return {
    commit: true,
    result: success(draft, { sessionId: sid, revoked: replaced }),
    effects,
    raises: [epoch.raise],
    minted: [minted],
  };
}
