/**
 * `redeem_child`: creates a child session for a subdomain host in the same
 * compare-and-set that sees its parent live, bound to the parent triple the
 * handoff code froze at its authorizing resolution.
 */
import { BROWSER_EXPIRY } from '../expiry';
import { checkEpochRead } from './epoch';
import {
  type DeviceContext,
  failure,
  type KindOutcome,
  noCommit,
  revocationEffects,
  success,
} from './reduce-common';
import {
  childrenOf,
  isLive,
  mintSecret,
  newId,
  revokeSession,
} from './sessions';
import { encodeBase64Url } from '../encoding';
import type { DeviceState, MutationOf } from './types';

export const MAX_LIVE_CHILDREN = 8;
export const MAX_RETAINED_CHILDREN = 32;

function validChild(child: MutationOf<'redeem_child'>['child']): boolean {
  return (
    typeof child === 'object' &&
    child !== null &&
    child.kind === 'child' &&
    typeof child.host === 'string' &&
    child.host.length > 0 &&
    typeof child.callback === 'string' &&
    child.callback.length > 0
  );
}

export async function reduceRedeemChild(
  draft: DeviceState,
  mutation: MutationOf<'redeem_child'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const { nowMs, codeParent } = mutation;
  if (!validChild(mutation.child) || typeof codeParent?.sid !== 'string') {
    return noCommit('invalid_operation');
  }
  const parent = Object.hasOwn(draft.sessions, codeParent.sid)
    ? draft.sessions[codeParent.sid]
    : undefined;
  if (!parent || parent.kind === 'child' || !isLive(draft, parent, nowMs)) {
    return noCommit('parent_unavailable');
  }
  const epoch = checkEpochRead(mutation.epoch, parent.userId, nowMs);
  if (!epoch.ok) return noCommit(epoch.reason);
  if (parent.epochSeen < epoch.epoch) {
    const revoked = revokeSession(draft, parent.sid, 'epoch', nowMs);
    return {
      commit: true,
      result: failure('parent_unavailable', revoked),
      effects: revocationEffects(draft, revoked),
      raises: [epoch.raise],
      minted: [],
    };
  }
  // A code minted before a rotation or a credential change no longer matches.
  if (codeParent.gen !== draft.gen || codeParent.epoch !== epoch.epoch) {
    return noCommit('parent_unavailable');
  }

  // Expired, unrevoked children hold nothing to revoke; they never block a handoff.
  for (const child of childrenOf(draft, parent.sid)) {
    if (child.revokedAt === null && !isLive(draft, child, nowMs))
      delete draft.sessions[child.sid];
  }
  const retained = childrenOf(draft, parent.sid);
  const live = retained.filter((child) => isLive(draft, child, nowMs));
  if (
    live.length >= MAX_LIVE_CHILDREN ||
    retained.length >= MAX_RETAINED_CHILDREN
  ) {
    return noCommit('rate_limited');
  }

  const policy = ctx.childPolicy ?? BROWSER_EXPIRY;
  const absoluteExpiresAt = Math.min(
    nowMs + policy.absoluteMs,
    parent.absoluteExpiresAt
  );
  const idleExpiresAt = Math.min(
    nowMs + policy.idleMs,
    parent.idleExpiresAt,
    absoluteExpiresAt
  );
  const minted = await mintSecret(ctx.entropy, ctx.hashSecret);
  let sid = newId(ctx.entropy);
  while (Object.hasOwn(draft.sessions, sid)) sid = newId(ctx.entropy);
  draft.sessions[sid] = {
    sid,
    userId: parent.userId,
    kind: 'child',
    parentSid: parent.sid,
    host: mutation.child.host,
    callback: mutation.child.callback,
    createdAt: nowMs,
    lastSeenAt: nowMs,
    idleExpiresAt,
    absoluteExpiresAt,
    authTime: parent.authTime,
    aal: parent.aal,
    amr: [...parent.amr],
    provider: null,
    providerSubject: null,
    upstream: null,
    epochSeen: epoch.epoch,
    revokedAt: null,
    revokedReason: null,
    reservationId: parent.reservationId,
    factors: parent.factors.map((factor) => ({ ...factor })),
    secondFactorSatisfied: parent.secondFactorSatisfied,
    childSecretHash: minted.secretHash,
  };
  return {
    commit: true,
    result: success(draft, { sessionId: sid }),
    effects: [
      {
        type: 'set_child_cookie',
        sessionId: sid,
        host: mutation.child.host,
        // The child cookie never outlives the parent's absolute deadline.
        maxAgeSeconds: Math.max(
          0,
          Math.floor((absoluteExpiresAt - nowMs) / 1000)
        ),
        secretHash: encodeBase64Url(minted.secretHash),
      },
      {
        type: 'audit',
        event: 'session.child_created',
        sessionId: sid,
        userId: parent.userId,
      },
    ],
    raises: [epoch.raise],
    minted: [minted],
  };
}
