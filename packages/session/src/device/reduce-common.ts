/**
 * Shared pieces of the recorded-mutation reducers: the reducer context, the
 * outcome shape and the acting-session guard every fenced mutation runs.
 */
import type { ExpiryPolicy } from '../expiry';
import { checkEpochRead } from './epoch';
import type { RouteRegistry } from './registry';
import {
  isLive,
  type MintedSecret,
  pendingOutboxEffects,
  revokedAuditEffects,
  revokeSession,
} from './sessions';
import type {
  DeviceState,
  Effect,
  Entropy,
  EpochRaise,
  EpochRead,
  FailureReason,
  OperationResult,
  SecretHasher,
  SessionRow,
} from './types';

export type DeviceContext = {
  registry: RouteRegistry;
  entropy: Entropy;
  hashSecret: SecretHasher;
  /** The child session policy; the browser policy when omitted. */
  childPolicy?: ExpiryPolicy;
};

export type KindOutcome =
  | { commit: false; result: OperationResult }
  | {
      commit: true;
      result: OperationResult;
      effects: Effect[];
      raises: EpochRaise[];
      minted: MintedSecret[];
    };

export function failure(
  reason: FailureReason,
  revoked: string[] = []
): OperationResult {
  return { ok: false, reason, revoked };
}

export function success(
  draft: DeviceState,
  extra: {
    sessionId?: string | null;
    grantId?: string | null;
    revoked?: string[];
  } = {}
): OperationResult {
  return {
    ok: true,
    sessionId:
      extra.sessionId === undefined ? draft.activeSid : extra.sessionId,
    gen: draft.gen,
    grantId: extra.grantId ?? null,
    revoked: extra.revoked ?? [],
    alreadyRevoked: false,
  };
}

export function noCommit(reason: FailureReason): KindOutcome {
  return { commit: false, result: failure(reason) };
}

/** The effects of sessions revoked inside a recorded mutation's commit. */
export function revocationEffects(
  draft: DeviceState,
  revoked: readonly string[]
): Effect[] {
  return [
    ...revokedAuditEffects(draft, revoked),
    ...pendingOutboxEffects(draft, revoked),
  ];
}

export type Acting = { row: SessionRow; epoch: number; raise: EpochRaise };

/**
 * The session a mutation acts on must be live and have a fresh epoch read
 * for its user. A session whose `epochSeen` is below the fresh epoch is
 * revoked in the same commit and the mutation returns `failWith`, unless the
 * caller exempts it (a credential change that sets the new epoch itself).
 */
export function guardActing(
  draft: DeviceState,
  sid: string | null,
  epoch: EpochRead,
  nowMs: number,
  options: { exemptBelowEpoch?: boolean; failWith?: FailureReason } = {}
): Acting | KindOutcome {
  const row =
    sid !== null && Object.hasOwn(draft.sessions, sid)
      ? draft.sessions[sid]
      : undefined;
  if (!row || !isLive(draft, row, nowMs)) return noCommit('signed_out');
  const checked = checkEpochRead(epoch, row.userId, nowMs);
  if (!checked.ok) return noCommit(checked.reason);
  if (row.epochSeen < checked.epoch && !options.exemptBelowEpoch) {
    const revoked = revokeSession(draft, row.sid, 'epoch', nowMs);
    return {
      commit: true,
      result: failure(options.failWith ?? 'signed_out', revoked),
      effects: revocationEffects(draft, revoked),
      raises: [checked.raise],
      minted: [],
    };
  }
  return { row, epoch: checked.epoch, raise: checked.raise };
}

export function isActing(value: Acting | KindOutcome): value is Acting {
  return 'row' in value;
}
