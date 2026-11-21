/**
 * `switch` and `rotate`: the two fenced-only mutations. Both issue a new
 * generation; only `rotate` keeps the previous secret for read-only grace.
 */
import { checkEpochRead } from './epoch';
import {
  type DeviceContext,
  failure,
  guardActing,
  isActing,
  type KindOutcome,
  noCommit,
  revocationEffects,
  success,
} from './reduce-common';
import {
  bumpGeneration,
  isLive,
  mintSecret,
  revokeSession,
  setCookieEffect,
} from './sessions';
import type { DeviceState, Effect, MutationOf } from './types';

/** A saved account older than this needs a fresh sign-in before it is switched to. */
export const SWITCH_MAX_AUTH_AGE_MS = 24 * 60 * 60_000;

export async function reduceSwitch(
  draft: DeviceState,
  mutation: MutationOf<'switch'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const { nowMs, targetSessionId } = mutation;
  const target =
    typeof targetSessionId === 'string' &&
    Object.hasOwn(draft.sessions, targetSessionId)
      ? draft.sessions[targetSessionId]
      : undefined;
  if (!target || target.kind === 'child' || target.sid === draft.activeSid) {
    return noCommit('invalid_operation');
  }
  if (!isLive(draft, target, nowMs)) return noCommit('signed_out');
  const epoch = checkEpochRead(mutation.epoch, target.userId, nowMs);
  if (!epoch.ok) return noCommit(epoch.reason);
  if (target.epochSeen < epoch.epoch) {
    const revoked = revokeSession(draft, target.sid, 'epoch', nowMs);
    return {
      commit: true,
      result: failure('signed_out', revoked),
      effects: revocationEffects(draft, revoked),
      raises: [epoch.raise],
      minted: [],
    };
  }
  // Step-up grants play no part: a switch needs a recent, complete sign-in.
  const needsSecondFactor =
    target.factors.some((factor) => factor.role === 'second_factor') &&
    !target.secondFactorSatisfied;
  if (nowMs - target.authTime > SWITCH_MAX_AUTH_AGE_MS || needsSecondFactor) {
    return noCommit('reauth_required');
  }
  const previous = draft.activeSid;
  const minted = await mintSecret(ctx.entropy, ctx.hashSecret);
  draft.activeSid = target.sid;
  if (!bumpGeneration(draft, minted, nowMs, false))
    return noCommit('invalid_operation');
  const effects: Effect[] = [
    setCookieEffect(draft, nowMs),
    {
      type: 'audit',
      event: 'session.switched',
      sessionId: target.sid,
      userId: target.userId,
    },
  ];
  if (previous !== null)
    effects.push({ type: 'tab_invalidate', sessionId: previous });
  return {
    commit: true,
    result: success(draft),
    effects,
    raises: [epoch.raise],
    minted: [minted],
  };
}

export async function reduceRotate(
  draft: DeviceState,
  mutation: MutationOf<'rotate'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const acting = guardActing(
    draft,
    draft.activeSid,
    mutation.epoch,
    mutation.nowMs
  );
  if (!isActing(acting)) return acting;
  const minted = await mintSecret(ctx.entropy, ctx.hashSecret);
  if (!bumpGeneration(draft, minted, mutation.nowMs, true)) {
    return noCommit('invalid_operation');
  }
  return {
    commit: true,
    result: success(draft),
    effects: [
      setCookieEffect(draft, mutation.nowMs),
      {
        type: 'audit',
        event: 'session.rotated',
        sessionId: acting.row.sid,
        userId: acting.row.userId,
      },
    ],
    raises: [acting.raise],
    minted: [minted],
  };
}
