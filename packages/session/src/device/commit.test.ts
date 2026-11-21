import { describe, expect, it } from 'vitest';
import {
  createWorld,
  effectTypes,
  epochRead,
  factorRead,
  fenceOf,
  outcomeFor,
  reasonOf,
  USER_A,
  USER_B,
} from '../__tests__/device-fixtures';
import { type DeviceMutation, operationStatus, requestHash } from '../device';

function signInBody(
  world: ReturnType<typeof createWorld>,
  operationId = 'op-sign-in'
): DeviceMutation {
  return {
    kind: 'sign_in',
    operationId,
    nowMs: world.now,
    fence: null,
    outcome: outcomeFor(USER_A),
    reservation: { reservationId: 'slot-1' },
    eviction: null,
    capturedEpoch: 0,
    epoch: epochRead(USER_A, 0, world.now),
    factors: factorRead(USER_A, world.now),
  };
}

describe('commit rule', () => {
  it('commits a sign-in with a new generation, cookie secret and index confirmation', async () => {
    const world = createWorld();
    const out = await world.commit(signInBody(world));
    expect(reasonOf(out)).toBe('ok');
    expect(out.replayed).toBe(false);
    expect(effectTypes(out)).toEqual(['set_cookie', 'audit', 'index_confirm']);
    const state = world.state();
    expect(state.version).toBe(1);
    expect(state.gen).toBe(1);
    expect(state.activeSid).toBe(out.result.ok ? out.result.sessionId : null);
    expect(world.secretOf(out)).toHaveLength(32);
    expect(operationStatus(state, 'op-sign-in')).toBe('succeeded');
  });

  it('replays an equal request from its record without a second transition', async () => {
    const world = createWorld();
    const first = await world.commit(signInBody(world));
    const second = await world.commit(signInBody(world));
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(effectTypes(second)).toEqual(effectTypes(first));
    // Another call never learns the raw secret.
    const cookie = second.effects.find(
      (effect) => effect.type === 'set_cookie'
    );
    expect(cookie && 'secret' in cookie ? cookie.secret : 'missing').toBeNull();
    expect(world.state().version).toBe(1);
  });

  it('returns idempotency_mismatch for a reused operation id with a different body', async () => {
    const world = createWorld();
    await world.commit(signInBody(world));
    const other = {
      ...signInBody(world),
      outcome: outcomeFor(USER_A, { amr: ['otp'] }),
    };
    expect(reasonOf(await world.commit(other as DeviceMutation))).toBe(
      'idempotency_mismatch'
    );
  });

  it('hashes the mutation without operationId and nowMs, with bytes as base64url', async () => {
    const world = createWorld();
    const body = signInBody(world);
    const same = await requestHash({
      ...body,
      operationId: 'other',
      nowMs: body.nowMs + 1,
    });
    const base = await requestHash(body);
    expect(same).toEqual(base);
    const outcome = outcomeFor(USER_A, {
      grant: { provider: 'supabase', data: new Uint8Array([9]) },
    });
    expect(
      await requestHash({ ...body, outcome } as DeviceMutation)
    ).not.toEqual(base);
  });

  it('a committed write whose acknowledgement was lost returns its stored result and secret', async () => {
    const world = createWorld();
    world.memory.faults.push('unknown_committed');
    const out = await world.commit(signInBody(world));
    expect(reasonOf(out)).toBe('ok');
    expect(out.replayed).toBe(true);
    expect(world.secretOf(out)).toHaveLength(32);
    expect(world.memory.committed).toHaveLength(1);
  });

  it('a lost acknowledgement on the last attempt is confirmed by the final read', async () => {
    const world = createWorld();
    world.memory.faults.push('conflict', 'unknown_lost', 'unknown_committed');
    const out = await world.commit(signInBody(world));
    expect(reasonOf(out)).toBe('ok');
    expect(out.replayed).toBe(true);
    expect(world.memory.committed).toHaveLength(1);
  });

  it('is unavailable with nothing emitted when no attempt committed', async () => {
    const world = createWorld();
    world.memory.faults.push('conflict', 'unknown_lost', 'throw');
    const out = await world.commit(signInBody(world));
    expect(reasonOf(out)).toBe('unavailable');
    expect(out.effects).toEqual([]);
    expect(world.state().version).toBe(0);
    expect(operationStatus(world.state(), 'op-sign-in')).toBe('absent');
  });

  it('a fenced mutation returns superseded after a conflict moved the state', async () => {
    const world = createWorld();
    await world.signIn(USER_A);
    const fence = fenceOf(world.state());
    // Another writer commits between this mutation's read and write.
    await world.signIn(USER_B);
    const out = await world.commit({
      kind: 'rotate',
      operationId: 'op-rotate',
      nowMs: world.now,
      fence,
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(out)).toBe('superseded');
    expect(out.effects).toEqual([]);
  });

  it('an unfenced mutation reduces again against the new state after a conflict', async () => {
    const world = createWorld();
    await world.signIn(USER_A);
    let moved = false;
    world.memory.interleave((state) => {
      if (moved) return null;
      moved = true;
      return { ...state, version: state.version + 1 };
    });
    const out = await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: 'op-fanout',
      nowMs: world.now,
      userId: USER_A,
      belowEpoch: 1,
      bumpedAtMs: world.now,
    });
    world.memory.interleave(null);
    expect(reasonOf(out)).toBe('ok');
    expect(out.result.ok && out.result.revoked).toHaveLength(1);
  });

  it('rejects a null fence where it is not allowed and malformed mutations', async () => {
    const world = createWorld();
    await world.signIn(USER_A);
    for (const kind of [
      'switch',
      'rotate',
      'grant_step_up',
      'consume_step_up',
      'record_factors',
    ]) {
      const out = await world.commit({
        kind,
        operationId: `op-${kind}`,
        nowMs: world.now,
        fence: null,
        epoch: world.epoch(USER_A),
      } as unknown as DeviceMutation);
      expect(reasonOf(out)).toBe('invalid_operation');
    }
    const noId = { ...signInBody(world), operationId: '' } as DeviceMutation;
    expect(reasonOf(await world.commit(noId))).toBe('invalid_operation');
    const badKind = {
      ...signInBody(world),
      kind: 'teleport',
    } as unknown as DeviceMutation;
    expect(reasonOf(await world.commit(badKind))).toBe('invalid_operation');
  });

  it('fails closed with nothing written when the entropy port fails', async () => {
    const world = createWorld();
    world.ctx.entropy = () => new Uint8Array(3);
    const out = await world.commit(signInBody(world));
    expect(reasonOf(out)).toBe('unavailable');
    expect(world.state().version).toBe(0);
  });
});
