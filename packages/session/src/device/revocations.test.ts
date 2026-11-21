import { describe, expect, it } from 'vitest';
import {
  createWorld,
  effectTypes,
  fenceOf,
  reasonOf,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import { type DeviceMutation, runDrain } from '../device';
import { createIssuer, createUpstream } from '../__tests__/device-fakes';

const logout = (
  world: World,
  sessionId: string,
  operationId = world.nextOp()
): DeviceMutation => ({
  kind: 'revoke',
  operationId,
  nowMs: world.now,
  fence: null,
  sessionId,
  reason: 'logout',
});

const slotRevoke = (
  world: World,
  userId: typeof USER_A,
  reservationId: string
): DeviceMutation => ({
  kind: 'revoke_user_on_device',
  operationId: world.nextOp(),
  nowMs: world.now,
  userId,
  reservationId,
});

async function active(world: World, userId = USER_A) {
  const out = await world.signIn(userId);
  return out.result.ok ? (out.result.sessionId as string) : '';
}

describe('logout', () => {
  it('revokes with an outbox row, emits the effects and clears the cookie, adding no record', async () => {
    const world = createWorld();
    const sid = await active(world);
    const records = Object.keys(world.state().operations).length;
    const out = await world.commit(logout(world, sid));
    expect(reasonOf(out)).toBe('ok');
    expect(out.cookie).toBe('clear');
    expect(effectTypes(out)).toEqual([
      'audit',
      'revoke_upstream',
      'revoke_credentials',
      'revoke_credentials',
    ]);
    const state = world.state();
    expect(state.sessions[sid]?.revokedAt).toBe(world.now);
    expect(state.sessions[sid]?.upstream).toBeNull();
    expect(state.outbox[sid]?.effects).toEqual({
      upstream: 'pending',
      cookie: 'acked',
      credentials: { ai_token: 'pending', handoff_code: 'pending' },
    });
    expect(Object.keys(state.operations)).toHaveLength(records);
    expect(state.activeSid).toBeNull();
  });

  it('keeps the cookie when another saved account stays live', async () => {
    const world = createWorld();
    await active(world, USER_A);
    const b = await active(world, USER_B);
    expect((await world.commit(logout(world, b))).cookie).toBe('keep');
  });

  it('accepts a null fence only for the caller’s own session', async () => {
    const world = createWorld();
    const a = await active(world, USER_A);
    await active(world, USER_B);
    expect(reasonOf(await world.commit(logout(world, a)))).toBe(
      'invalid_operation'
    );
    expect(reasonOf(await world.commit(logout(world, 'unknown')))).toBe(
      'not_found'
    );
    const fenced = await world.commit({
      ...logout(world, a),
      fence: fenceOf(world.state()),
    } as DeviceMutation);
    expect(reasonOf(fenced)).toBe('ok');
    const wrong = await world.commit({
      ...logout(world, world.state().activeSid as string),
      fence: { ...fenceOf(world.state()), gen: 0 },
    } as DeviceMutation);
    expect(reasonOf(wrong)).toBe('superseded');
  });

  it('thousands of repeated logouts leave the state and maps unchanged', async () => {
    const world = createWorld();
    const sid = await active(world);
    await world.commit(logout(world, sid, 'logout-1'));
    const before = structuredClone(world.state());
    for (let index = 0; index < 2_000; index += 1) {
      const out = await world.commit(logout(world, sid, `logout-${index % 3}`));
      expect(out.result.ok && out.result.alreadyRevoked).toBe(true);
    }
    expect(world.state()).toEqual(before);
  });

  it('re-emits from the outbox after a lost acknowledgement and returns success with the cookie', async () => {
    const world = createWorld();
    const sid = await active(world);
    world.memory.faults.push('unknown_committed');
    const out = await world.commit(logout(world, sid));
    expect(reasonOf(out)).toBe('ok');
    expect(out.replayed).toBe(true);
    expect(out.cookie).toBe('clear');
    expect(effectTypes(out)).toContain('revoke_upstream');
  });

  it('reports unavailable, never success, when no write landed', async () => {
    const world = createWorld();
    const sid = await active(world);
    world.memory.faults.push('unknown_lost', 'conflict', 'unknown_lost');
    const out = await world.commit(logout(world, sid));
    expect(reasonOf(out)).toBe('unavailable');
    expect(out.effects).toEqual([]);
    expect(world.state().sessions[sid]?.revokedAt).toBeNull();
  });

  it('emits nothing on a replay after every effect is acknowledged', async () => {
    const world = createWorld();
    const sid = await active(world);
    await world.commit(logout(world, sid));
    const issuers = {
      ai_token: createIssuer('ai_token', () => world.now),
      handoff_code: createIssuer('handoff_code', () => world.now),
    };
    world.advance(60_000);
    await runDrain(
      world.memory.store,
      {
        upstream: createUpstream().port,
        issuers: {
          ai_token: issuers.ai_token.issuer,
          handoff_code: issuers.handoff_code.issuer,
        },
      },
      world.now
    );
    const replay = await world.commit(logout(world, sid));
    expect(reasonOf(replay)).toBe('ok');
    expect(replay.effects).toEqual([]);
    expect(replay.cookie).toBeNull();
  });

  it('a logout replayed after a later sign-in leaves the new cookie alone', async () => {
    const world = createWorld();
    const sid = await active(world);
    world.memory.faults.push('unknown_committed');
    await world.commit(logout(world, sid, 'logout-x'));
    await active(world);
    const replay = await world.commit(logout(world, sid, 'logout-x'));
    expect(reasonOf(replay)).toBe('ok');
    expect(replay.cookie).toBeNull();
  });
});

describe('system revokes', () => {
  it('revokes only sessions below the bump, exclusive, and raises the cache to the bump time', async () => {
    const world = createWorld();
    const old = await active(world, USER_A);
    world.epochs[USER_A] = 2;
    const keep = await active(world, USER_B);
    const out = await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: world.nextOp(),
      nowMs: world.now + 50_000,
      userId: USER_A,
      belowEpoch: 2,
      bumpedAtMs: world.now,
    });
    expect(out.result.ok && out.result.revoked).toEqual([old]);
    expect(world.state().sessions[keep]?.revokedAt).toBeNull();
    expect(world.memory.cache[USER_A]).toEqual({
      epoch: 2,
      readAtMs: world.now,
    });
  });

  it('never lowers the cache under a late lower fan-out or a concurrent versioned commit', async () => {
    const world = createWorld();
    await active(world);
    const fanOut = (
      belowEpoch: number,
      bumpedAtMs: number
    ): DeviceMutation => ({
      kind: 'revoke_user_below_epoch',
      operationId: world.nextOp(),
      nowMs: world.now,
      userId: USER_A,
      belowEpoch,
      bumpedAtMs,
    });
    await world.commit(fanOut(5, world.now));
    await world.commit(fanOut(3, world.now + 1));
    // A late intermediate fan-out keeps its own bump time.
    await world.commit(fanOut(5, world.now - 20_000));
    world.epochs[USER_A] = 0;
    await active(world);
    expect(world.memory.cache[USER_A]).toEqual({
      epoch: 5,
      readAtMs: world.now,
    });
  });

  it('revokes by slot only, records the slot, and answers already_revoked and not_found', async () => {
    const world = createWorld();
    await world.signIn(USER_A, {
      reservation: { reservationId: 'slot-early' },
    });
    const evicted = await world.signIn(USER_A, {
      reservation: { reservationId: 'slot-evicted' },
    });
    const evictedSid = evicted.result.ok
      ? (evicted.result.sessionId as string)
      : '';
    const other = await active(world, USER_B);
    const out = await world.commit(slotRevoke(world, USER_A, 'slot-evicted'));
    expect(out.result.ok && out.result.revoked).toEqual([evictedSid]);
    expect(world.state().revokedReservations['slot-evicted']).toBe(world.now);
    expect(world.state().sessions[other]?.revokedAt).toBeNull();
    const again = await world.commit(slotRevoke(world, USER_A, 'slot-evicted'));
    expect(again.result.ok && again.result.alreadyRevoked).toBe(true);
    expect(
      reasonOf(await world.commit(slotRevoke(world, USER_A, 'slot-never')))
    ).toBe('not_found');
    expect(
      reasonOf(await world.commit(slotRevoke(world, USER_B, 'slot-evicted')))
    ).toBe('ok');
  });

  it('a redelivered slot revoke spares a later sign-in under another slot', async () => {
    const world = createWorld();
    await world.signIn(USER_A, { reservation: { reservationId: 'slot-1' } });
    await world.commit(slotRevoke(world, USER_A, 'slot-1'));
    const later = await world.signIn(USER_A, {
      reservation: { reservationId: 'slot-2' },
    });
    const laterSid = later.result.ok ? (later.result.sessionId as string) : '';
    const redelivered = await world.commit(slotRevoke(world, USER_A, 'slot-1'));
    expect(redelivered.result.ok && redelivered.result.alreadyRevoked).toBe(
      true
    );
    expect(world.state().sessions[laterSid]?.revokedAt).toBeNull();
    expect(
      reasonOf(
        await world.signIn(USER_A, { reservation: { reservationId: 'slot-1' } })
      )
    ).toBe('invalid_operation');
  });

  it('a system revoke cookie waits for the next response to this device', async () => {
    const world = createWorld();
    const sid = await active(world);
    const out = await world.commit(
      slotRevoke(
        world,
        USER_A,
        world.state().sessions[sid]?.reservationId as string
      )
    );
    expect(out.cookie).toBeNull();
    expect(world.state().outbox[sid]?.effects.cookie).toBe('pending');
  });
});
