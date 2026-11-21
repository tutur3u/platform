/**
 * The commit loop. A recorded mutation reads, replays a stored record or
 * reduces, and compare-and-sets; on `conflict` or `unknown` it reads again,
 * so a write that committed but lost its acknowledgement returns its stored
 * result and effects. After three attempts one final read decides; only when
 * it shows no record is the result `unavailable`, with nothing emitted.
 * Revocations follow the same loop with the outbox as their record.
 */
import { constantTimeEqual, decodeBase64Url } from '../encoding';
import { requestHash } from './hash';
import {
  type CookieDirective,
  type CookieScope,
  cookieDirectiveFor,
} from './outbox';
import {
  lookupRecord,
  type RecordedMutation,
  reduceRecorded,
  validMutationShape,
} from './reduce';
import { type DeviceContext, failure } from './reduce-common';
import {
  isRevocation,
  planRevocation,
  type RevocationMutation,
  type RevocationPlan,
  revocationVisible,
} from './revocations';
import { pendingOutboxEffects, revokedAuditEffects } from './sessions';
import type {
  DeviceMutation,
  DeviceState,
  DeviceStore,
  Effect,
  EmittedEffect,
  EpochRaise,
  OperationResult,
  WriteOutcome,
} from './types';

export const COMMIT_ATTEMPTS = 3;

export type CommitDeps = { store: DeviceStore; ctx: DeviceContext };

export type CommitOutcome = {
  result: OperationResult;
  /** Effects of a committed record only; empty for every uncommitted result. */
  effects: EmittedEffect[];
  /** The cookie a logout's own response carries. */
  cookie: CookieDirective | null;
  /** True when the result came from a stored record or outbox, not this call's write. */
  replayed: boolean;
};

const UNAVAILABLE: CommitOutcome = {
  result: failure('unavailable'),
  effects: [],
  cookie: null,
  replayed: false,
};

function uncommitted(result: OperationResult): CommitOutcome {
  return { result, effects: [], cookie: null, replayed: false };
}

async function safeRead(store: DeviceStore): Promise<DeviceState | null> {
  try {
    return await store.read();
  } catch {
    return null;
  }
}

async function safeWrite(
  store: DeviceStore,
  expected: number,
  next: DeviceState,
  raises: EpochRaise[]
): Promise<WriteOutcome> {
  try {
    return await store.write(expected, next, raises);
  } catch {
    // A thrown write may or may not have committed.
    return 'unknown';
  }
}

type Minted = { secretHash: Uint8Array; secret: Uint8Array }[];

/** Attaches a raw secret minted by this call; a replay from another call gets none. */
function emit(effects: readonly Effect[], minted: Minted): EmittedEffect[] {
  return effects.map((effect) => {
    if (effect.type !== 'set_cookie' && effect.type !== 'set_child_cookie')
      return effect;
    const hash = decodeBase64Url(effect.secretHash);
    const match = hash
      ? minted.find((entry) => constantTimeEqual(entry.secretHash, hash))
      : undefined;
    return { ...effect, secret: match ? new Uint8Array(match.secret) : null };
  });
}

async function commitRecorded(
  deps: CommitDeps,
  mutation: RecordedMutation
): Promise<CommitOutcome> {
  const hash = await requestHash(mutation);
  if (!hash) return uncommitted(failure('invalid_operation'));
  const minted: Minted = [];
  const fromRecord = (state: DeviceState): CommitOutcome | null => {
    const lookup = lookupRecord(state, mutation.operationId, hash);
    if (lookup.kind === 'replay') {
      return {
        result: lookup.record.result,
        effects: emit(lookup.record.effects, minted),
        cookie: null,
        replayed: true,
      };
    }
    if (lookup.kind === 'none') return null;
    return uncommitted(failure(lookup.kind));
  };
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    const state = await safeRead(deps.store);
    if (!state) continue;
    const stored = fromRecord(state);
    if (stored) return stored;
    let reduced: Awaited<ReturnType<typeof reduceRecorded>>;
    try {
      reduced = await reduceRecorded(state, mutation, deps.ctx, hash);
    } catch {
      // A failing entropy or hashing port fails closed with nothing written.
      return UNAVAILABLE;
    }
    if (!reduced.commit) return uncommitted(reduced.result);
    minted.push(...reduced.minted);
    const written = await safeWrite(
      deps.store,
      state.version,
      reduced.next,
      reduced.raises
    );
    if (written === 'committed') {
      return {
        result: reduced.result,
        effects: emit(reduced.effects, minted),
        cookie: null,
        replayed: false,
      };
    }
  }
  const final = await safeRead(deps.store);
  return (final && fromRecord(final)) ?? UNAVAILABLE;
}

function scopeOf(
  state: DeviceState,
  mutation: RevocationMutation
): CookieScope {
  if (
    mutation.kind === 'revoke' &&
    state.sessions[mutation.sessionId]?.kind === 'child'
  ) {
    return { kind: 'child', sessionId: mutation.sessionId };
  }
  return { kind: 'device' };
}

function revocationOutcome(
  state: DeviceState,
  plan: Extract<RevocationPlan, { kind: 'done' }>,
  cookie: CookieDirective | null,
  replayed: boolean
): CommitOutcome {
  return {
    result: {
      ok: true,
      sessionId: null,
      gen: state.gen,
      grantId: null,
      revoked: plan.revoked,
      alreadyRevoked: plan.alreadyRevoked,
    },
    effects: [
      ...revokedAuditEffects(state, plan.revoked),
      ...pendingOutboxEffects(state, plan.keys),
    ] as EmittedEffect[],
    cookie,
    replayed,
  };
}

async function commitRevocation(
  deps: CommitDeps,
  mutation: RevocationMutation
): Promise<CommitOutcome> {
  const isLogout = mutation.kind === 'revoke' && mutation.fence === null;
  let sawUnknown = false;
  /** The logout cookie after a lost acknowledgement, from the generation rule alone. */
  const replayCookie = (state: DeviceState, keys: string[]) =>
    isLogout && sawUnknown
      ? cookieDirectiveFor(
          state,
          mutation.nowMs,
          scopeOf(state, mutation),
          keys
        )
      : null;
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    const state = await safeRead(deps.store);
    if (!state) continue;
    const plan = planRevocation(state, mutation);
    if (plan.kind === 'fail') return uncommitted(failure(plan.reason));
    if (plan.next === null && plan.raises.length === 0) {
      return revocationOutcome(
        state,
        plan,
        replayCookie(state, plan.keys),
        true
      );
    }
    const next = plan.next ?? state;
    const written = await safeWrite(
      deps.store,
      state.version,
      next,
      plan.raises
    );
    if (written === 'committed')
      return revocationOutcome(next, plan, plan.cookie, false);
    if (written === 'unknown') sawUnknown = true;
  }
  const final = await safeRead(deps.store);
  if (!final || !revocationVisible(final, mutation)) return UNAVAILABLE;
  const plan = planRevocation(final, mutation);
  if (plan.kind !== 'done') return UNAVAILABLE;
  return revocationOutcome(final, plan, replayCookie(final, plan.keys), true);
}

/** Runs one mutation through the commit rule against the device store. */
export async function commitMutation(
  deps: CommitDeps,
  mutation: DeviceMutation
): Promise<CommitOutcome> {
  if (!validMutationShape(mutation))
    return uncommitted(failure('invalid_operation'));
  if (isRevocation(mutation)) return commitRevocation(deps, mutation);
  return commitRecorded(deps, mutation as RecordedMutation);
}
