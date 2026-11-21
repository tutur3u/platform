/**
 * `record_factors`: commits an MFA, passkey or password change. It consumes
 * a grant for the route's act under the same checks as `consume_step_up`,
 * derives the session's next factors from the act, keeps the acting session
 * alive across a credential change at the new epoch, and bumps `gen`.
 */
import { checkEpochRead, checkFactorRead } from './epoch';
import type { NormalizedParams } from './params';
import { normalizeParams } from './params';
import {
  type DeviceContext,
  failure,
  type KindOutcome,
  noCommit,
  revocationEffects,
  success,
} from './reduce-common';
import { checkGrant, stepUpRoute } from './reduce-step-up';
import { actSpec, FACTOR_ACTS, type GrantAct, ISSUER_IDS } from './registry';
import {
  bumpGeneration,
  changeRowKey,
  credentialChangeRow,
  isLive,
  mintSecret,
  revokeSession,
  setCookieEffect,
} from './sessions';
import type {
  DeviceState,
  Effect,
  FailureReason,
  FreshFactors,
  MutationOf,
  SessionFactor,
  SessionRow,
} from './types';

type Derived =
  | { ok: true; factors: SessionFactor[] }
  | { ok: false; reason: FailureReason };

const INVALID: Derived = { ok: false, reason: 'invalid_operation' };

function removeExactly(
  factors: SessionFactor[],
  ids: readonly string[],
  keep: (factor: SessionFactor) => boolean
): Derived {
  const removable = new Set(
    factors.filter((factor) => !keep(factor)).map((f) => f.factorId)
  );
  if (ids.some((id) => !removable.has(id))) return INVALID;
  const removed = new Set(ids);
  return {
    ok: true,
    factors: factors.filter((factor) => !removed.has(factor.factorId)),
  };
}

/** The session's next factors for `act`, from its own factors or, for a reset, a fresh read. */
export function deriveFactors(
  act: GrantAct,
  row: SessionRow,
  params: NormalizedParams,
  read: FreshFactors | 'unavailable' | null,
  nowMs: number
): Derived {
  const current = row.factors.map((factor) => ({ ...factor }));
  const has = (id: string) => current.some((factor) => factor.factorId === id);
  switch (act) {
    case 'account.mfa.enroll': {
      const method = params.factorType;
      const factorId = params.factorId as string;
      if ((method !== 'totp' && method !== 'passkey') || has(factorId))
        return INVALID;
      return {
        ok: true,
        factors: [...current, { factorId, method, role: 'second_factor' }],
      };
    }
    case 'account.passkey.enroll': {
      const factorId = params.credentialId as string;
      if (has(factorId)) return INVALID;
      return {
        ok: true,
        factors: [...current, { factorId, method: 'passkey', role: 'sign_in' }],
      };
    }
    case 'account.mfa.remove':
      return removeExactly(
        current,
        params.factorIds as string[],
        (factor) => factor.role !== 'second_factor'
      );
    case 'account.passkey.remove':
      return removeExactly(
        current,
        params.credentialIds as string[],
        (factor) => factor.method !== 'passkey' || factor.role !== 'sign_in'
      );
    case 'account.mfa.reset': {
      const fresh = checkFactorRead(read, row.userId, nowMs);
      if (!fresh.ok) return fresh;
      // Reset covers exactly the second factors enrolled now, wherever enrolled.
      const enrolled = fresh.factors
        .filter((factor) => factor.role === 'second_factor')
        .map((factor) => factor.factorId)
        .sort();
      const listed = params.factorIds as string[];
      if (
        enrolled.length !== listed.length ||
        enrolled.some((id, index) => id !== listed[index])
      ) {
        return { ok: false, reason: 'factor_mismatch' };
      }
      return {
        ok: true,
        factors: fresh.factors.filter((factor) => factor.role === 'sign_in'),
      };
    }
    case 'account.password':
      return { ok: true, factors: current };
    default:
      return INVALID;
  }
}

export async function reduceRecordFactors(
  draft: DeviceState,
  mutation: MutationOf<'record_factors'>,
  ctx: DeviceContext
): Promise<KindOutcome> {
  const { nowMs, credentialChange } = mutation;
  const stepUp = stepUpRoute(ctx.registry, mutation.route);
  if (!stepUp || !FACTOR_ACTS.includes(stepUp.act))
    return noCommit('invalid_operation');
  const isChange = actSpec(stepUp.act).credentialChange === 'yes';
  if (
    isChange !== (credentialChange !== null && credentialChange !== undefined)
  ) {
    return noCommit('invalid_operation');
  }
  const isReset = stepUp.act === 'account.mfa.reset';
  if (!isReset && mutation.factors !== null)
    return noCommit('invalid_operation');

  const sid = draft.activeSid;
  const row = sid !== null ? draft.sessions[sid] : undefined;
  if (!row || !isLive(draft, row, nowMs)) return noCommit('signed_out');
  const epoch = checkEpochRead(mutation.epoch, row.userId, nowMs);
  if (!epoch.ok) return noCommit(epoch.reason);
  if (credentialChange) {
    if (
      credentialChange.newEpoch !== epoch.epoch ||
      !(epoch.epoch > row.epochSeen)
    ) {
      return noCommit('invalid_operation');
    }
  } else if (row.epochSeen < epoch.epoch) {
    const revoked = revokeSession(draft, row.sid, 'epoch', nowMs);
    return {
      commit: true,
      result: failure('signed_out', revoked),
      effects: revocationEffects(draft, revoked),
      raises: [epoch.raise],
      minted: [],
    };
  }
  const checked = await checkGrant(draft, {
    grantId: mutation.grantId,
    stepUp,
    params: mutation.params,
    sid: row.sid,
    nowMs,
  });
  if (!checked.ok) return noCommit(checked.reason);
  const params = normalizeParams(
    stepUp.act,
    stepUp.tenantParams,
    mutation.params
  );
  if (!params) return noCommit('invalid_operation');
  const derived = deriveFactors(
    stepUp.act,
    row,
    params,
    mutation.factors,
    nowMs
  );
  if (!derived.ok) return noCommit(derived.reason);

  const hadSecond = row.factors.some(
    (factor) => factor.role === 'second_factor'
  );
  const hasSecond = derived.factors.some(
    (factor) => factor.role === 'second_factor'
  );
  // Never set true here; a first second factor needs a fresh sign-in to count.
  if (!hadSecond && hasSecond) row.secondFactorSatisfied = false;
  row.factors = derived.factors;
  checked.grant.consumedBy = mutation.operationId;

  const effects: Effect[] = [];
  const changeKey = changeRowKey(row.sid, nowMs);
  if (credentialChange) {
    // This session is exempt from the below-epoch check: it carries the new epoch.
    row.epochSeen = credentialChange.newEpoch;
    const key = changeKey;
    draft.outbox[key] = credentialChangeRow(draft, row.sid, nowMs);
    for (const issuer of ISSUER_IDS) {
      effects.push({
        type: 'revoke_credentials',
        outboxKey: key,
        sessionId: row.sid,
        issuer,
        before: nowMs,
      });
    }
  }
  const minted = await mintSecret(ctx.entropy, ctx.hashSecret);
  if (!bumpGeneration(draft, minted, nowMs, false))
    return noCommit('invalid_operation');
  // The change row records the generation the change committed at.
  const changeRow = draft.outbox[changeKey];
  if (credentialChange && changeRow) changeRow.gen = draft.gen;
  effects.unshift(setCookieEffect(draft, nowMs), {
    type: 'audit',
    event: 'session.factors_changed',
    sessionId: row.sid,
    userId: row.userId,
    reason: stepUp.act,
  });
  return {
    commit: true,
    result: success(draft, { grantId: checked.grant.id }),
    effects,
    raises: [epoch.raise],
    minted: [minted],
  };
}
