/**
 * `grant_step_up` and `consume_step_up`, and the grant check `record_factors`
 * shares. A grant binds the new `sid`, `gen`, the route's registry `act`, the
 * `ph` the reducer computes from raw parameters, and a 5-minute expiry; a
 * consume recomputes `ph` from its own raw parameters.
 */
import {
  constantTimeEqual,
  decodeBase64Url,
  type JsonValue,
} from '../encoding';
import { grantParamsHash } from './params';
import {
  type DeviceContext,
  guardActing,
  isActing,
  type KindOutcome,
  noCommit,
  success,
} from './reduce-common';
import {
  actSpec,
  FACTOR_ACTS,
  type RouteId,
  type RouteRegistry,
  type StepUpRoute,
  stepUpOf,
} from './registry';
import { bumpGeneration, mintSecret, newId, setCookieEffect } from './sessions';
import type {
  DeviceState,
  Effect,
  FailureReason,
  MutationOf,
  StepUpGrant,
} from './types';

export const GRANT_TTL_MS = 5 * 60_000;

export function stepUpRoute(
  registry: RouteRegistry,
  route: RouteId
): StepUpRoute['stepUp'] | null {
  if (typeof route !== 'string') return null;
  // An unknown route is `security` with no act, so it never takes a step-up.
  return stepUpOf(registry.get(route));
}

export type GrantCheck =
  | { ok: true; grant: StepUpGrant }
  | { ok: false; reason: FailureReason };

/**
 * The grant named by `grantId` matches the acting session, the current
 * generation, the route's act and the parameters hash, is unconsumed and
 * unexpired.
 */
export async function checkGrant(
  draft: DeviceState,
  input: {
    grantId: string;
    stepUp: StepUpRoute['stepUp'];
    params: JsonValue;
    sid: string;
    nowMs: number;
  }
): Promise<GrantCheck> {
  const hashed = await grantParamsHash(input.stepUp, input.params);
  if (!hashed) return { ok: false, reason: 'invalid_operation' };
  const grant =
    typeof input.grantId === 'string' &&
    Object.hasOwn(draft.grants, input.grantId)
      ? draft.grants[input.grantId]
      : undefined;
  if (!grant || grant.consumedBy !== undefined)
    return { ok: false, reason: 'grant_invalid' };
  const stored = decodeBase64Url(grant.ph);
  const computed = decodeBase64Url(hashed.ph);
  const phMatches =
    stored !== null && computed !== null && constantTimeEqual(stored, computed);
  if (
    grant.sid !== input.sid ||
    grant.gen !== draft.gen ||
    grant.act !== input.stepUp.act ||
    !phMatches
  ) {
    return { ok: false, reason: 'grant_invalid' };
  }
  if (input.nowMs >= grant.expiresAtMs)
    return { ok: false, reason: 'grant_expired' };
  return { ok: true, grant };
}

export async function reduceGrantStepUp(
  draft: DeviceState,
  mutation: MutationOf<'grant_step_up'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const stepUp = stepUpRoute(ctx.registry, mutation.route);
  if (!stepUp) return noCommit('invalid_operation');
  const hashed = await grantParamsHash(stepUp, mutation.params);
  if (!hashed) return noCommit('invalid_operation');
  const acting = guardActing(
    draft,
    draft.activeSid,
    mutation.epoch,
    mutation.nowMs
  );
  if (!isActing(acting)) return acting;
  const minted = await mintSecret(ctx.entropy, ctx.hashSecret);
  if (!bumpGeneration(draft, minted, mutation.nowMs, false)) {
    return noCommit('invalid_operation');
  }
  let id = newId(ctx.entropy);
  while (Object.hasOwn(draft.grants, id)) id = newId(ctx.entropy);
  draft.grants[id] = {
    id,
    sid: acting.row.sid,
    gen: draft.gen,
    act: stepUp.act,
    ph: hashed.ph,
    expiresAtMs: mutation.nowMs + GRANT_TTL_MS,
  };
  return {
    commit: true,
    result: success(draft, { grantId: id }),
    effects: [
      setCookieEffect(draft, mutation.nowMs),
      {
        type: 'audit',
        event: 'session.step_up',
        sessionId: acting.row.sid,
        userId: acting.row.userId,
        reason: stepUp.act,
      },
    ],
    raises: [acting.raise],
    minted: [minted],
  };
}

export async function reduceConsumeStepUp(
  draft: DeviceState,
  mutation: MutationOf<'consume_step_up'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const stepUp = stepUpRoute(ctx.registry, mutation.route);
  // Factor and credential acts commit only through `record_factors`.
  if (!stepUp || FACTOR_ACTS.includes(stepUp.act))
    return noCommit('invalid_operation');
  const acting = guardActing(
    draft,
    draft.activeSid,
    mutation.epoch,
    mutation.nowMs
  );
  if (!isActing(acting)) return acting;
  const checked = await checkGrant(draft, {
    grantId: mutation.grantId,
    stepUp,
    params: mutation.params,
    sid: acting.row.sid,
    nowMs: mutation.nowMs,
  });
  if (!checked.ok) return noCommit(checked.reason);
  checked.grant.consumedBy = mutation.operationId;
  const effects: Effect[] = [
    {
      type: 'audit',
      event: 'session.step_up_consumed',
      sessionId: acting.row.sid,
      userId: acting.row.userId,
      reason: stepUp.act,
    },
  ];
  if (actSpec(stepUp.act).credentialChange === 'revoke_all') {
    effects.push({
      type: 'epoch_bump',
      userId: acting.row.userId,
      act: stepUp.act,
    });
  }
  return {
    commit: true,
    result: success(draft, { grantId: checked.grant.id }),
    effects,
    raises: [acting.raise],
    minted: [],
  };
}
