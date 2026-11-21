import { describe, expect, it } from 'vitest';
import { createUserIndex } from '../__tests__/device-fakes';
import {
  createWorld,
  effectTypes,
  factorRead,
  outcomeFor,
  reasonOf,
  type World,
} from '../__tests__/device-fixtures';
import {
  type DeviceMutation,
  leaseDecision,
  MAX_DEVICE_USERS,
  operationStatus,
  signInWithReservation,
} from '../device';
import type { UserId } from '../principal';

/** A distinct user id per index. */
const userN = (index: number) =>
  `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000` as UserId;

const USERS = Array.from({ length: MAX_DEVICE_USERS + 2 }, (_, index) =>
  userN(index + 1)
);

async function fill(world: World, count = MAX_DEVICE_USERS) {
  const sids: string[] = [];
  for (const userId of USERS.slice(0, count)) {
    const out = await world.signIn(userId);
    expect(reasonOf(out)).toBe('ok');
    if (out.result.ok) sids.push(out.result.sessionId as string);
  }
  return sids;
}

function distinctLiveUsers(world: World) {
  return new Set(
    Object.values(world.state().sessions)
      .filter((row) => row.kind !== 'child' && row.revokedAt === null)
      .map((row) => row.userId)
  ).size;
}

function signInMutation(world: World, userId: UserId, operationId: string) {
  return {
    kind: 'sign_in',
    operationId,
    nowMs: world.now,
    fence: {
      sessionId: world.state().activeSid,
      gen: world.state().gen,
      version: world.state().version,
    },
    outcome: outcomeFor(userId),
    reservation: { reservationId: `slot-${operationId}` },
    eviction: null,
    capturedEpoch: 0,
    epoch: world.epoch(userId),
    factors: factorRead(userId, world.now),
  } as DeviceMutation;
}

describe(`sign_in distinct-user ceiling of ${MAX_DEVICE_USERS}`, () => {
  it('admits 10 distinct users and refuses an 11th, storing only the rejection', async () => {
    const world = createWorld();
    await fill(world);
    expect(distinctLiveUsers(world)).toBe(MAX_DEVICE_USERS);
    const before = structuredClone(world.state());

    const eleventh = USERS[MAX_DEVICE_USERS] as UserId;
    const mutation = signInMutation(world, eleventh, 'op-over');
    const out = await world.commit(mutation);
    expect(reasonOf(out)).toBe('account_limit');
    expect(out.result.revoked).toEqual([]);
    expect(effectTypes(out)).toEqual(['index_release', 'audit']);
    expect(out.effects).toContainEqual({
      type: 'audit',
      event: 'session.sign_in_rejected',
      sessionId: null,
      userId: eleventh,
      reason: 'account_limit',
    });
    expect(out.cookie).toBeNull();

    const after = world.state();
    expect(after.sessions).toEqual(before.sessions);
    expect(after.activeSid).toBe(before.activeSid);
    expect(after.gen).toBe(before.gen);
    expect(after.secretHash).toEqual(before.secretHash);
    expect(after.grace).toEqual(before.grace);
    expect(after.grants).toEqual(before.grants);
    expect(Object.keys(after.operations)).toEqual([
      ...Object.keys(before.operations),
      'op-over',
    ]);
    expect(after.operations['op-over']?.result).toEqual(out.result);
    expect(operationStatus(after, 'op-over')).toBe('rejected');

    // A replay returns the stored rejection without a second transition.
    const replay = await world.commit(mutation);
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(out.result);
    expect(world.state().version).toBe(after.version);
  });

  it('admits a repeat sign-in of a user already on a full device', async () => {
    const world = createWorld();
    const sids = await fill(world);
    const out = await world.signIn(USERS[0] as UserId);
    expect(reasonOf(out)).toBe('ok');
    expect(out.result.revoked).toEqual([sids[0]]);
    expect(distinctLiveUsers(world)).toBe(MAX_DEVICE_USERS);
  });

  it('admits a new user once a revoked session frees a place', async () => {
    const world = createWorld();
    const sids = await fill(world);
    const eleventh = USERS[MAX_DEVICE_USERS] as UserId;
    expect(reasonOf(await world.signIn(eleventh))).toBe('account_limit');
    const revoked = await world.commit({
      kind: 'revoke',
      operationId: world.nextOp(),
      nowMs: world.now,
      fence: {
        sessionId: world.state().activeSid,
        gen: world.state().gen,
        version: world.state().version,
      },
      sessionId: sids[3] as string,
      reason: 'user',
    });
    expect(reasonOf(revoked)).toBe('ok');
    expect(reasonOf(await world.signIn(eleventh))).toBe('ok');
    expect(distinctLiveUsers(world)).toBe(MAX_DEVICE_USERS);
    expect(
      reasonOf(await world.signIn(USERS[MAX_DEVICE_USERS + 1] as UserId))
    ).toBe('account_limit');
  });

  it('never counts child sessions as users', async () => {
    const world = createWorld();
    await fill(world, MAX_DEVICE_USERS - 1);
    const active = world.state().activeSid as string;
    const parentUser = world.state().sessions[active]?.userId as UserId;
    for (let index = 0; index < 3; index += 1) {
      const child = await world.commit({
        kind: 'redeem_child',
        operationId: world.nextOp(),
        nowMs: world.now,
        codeParent: { sid: active, gen: world.state().gen, epoch: 0 },
        child: { host: 'calendar.example.test', callback: '/', kind: 'child' },
        epoch: world.epoch(parentUser),
      });
      expect(reasonOf(child)).toBe('ok');
    }
    const tenth = USERS[MAX_DEVICE_USERS - 1] as UserId;
    expect(reasonOf(await world.signIn(tenth))).toBe('ok');
    expect(
      Object.values(world.state().sessions).filter(
        (row) => row.kind === 'child'
      )
    ).toHaveLength(3);
  });

  it('releases the reservation and reports the operation rejected', async () => {
    const world = createWorld();
    let next = 0;
    const index = createUserIndex(() => `res-${++next}`);
    const deps = {
      store: world.memory.store,
      ctx: world.ctx,
      index: index.port,
    };
    const request = (userId: UserId, operationId: string) => ({
      operationId,
      nowMs: world.now,
      fence:
        world.state().version === 0
          ? null
          : {
              sessionId: world.state().activeSid,
              gen: world.state().gen,
              version: world.state().version,
            },
      outcome: outcomeFor(userId),
      capturedEpoch: 0,
      epoch: world.epoch(userId),
      factors: factorRead(userId, world.now),
      deviceId: 'device-1',
      cap: 3,
    });
    for (const [position, userId] of USERS.slice(
      0,
      MAX_DEVICE_USERS
    ).entries()) {
      const out = await signInWithReservation(
        deps,
        request(userId, `op-${position}`)
      );
      expect(reasonOf(out)).toBe('ok');
      expect(index.slotOf(userId, 'device-1')?.confirmed).toBe(true);
    }
    const eleventh = USERS[MAX_DEVICE_USERS] as UserId;
    const out = await signInWithReservation(deps, request(eleventh, 'op-over'));
    expect(reasonOf(out)).toBe('account_limit');
    expect(index.slotOf(eleventh, 'device-1')).toBeNull();
    expect(operationStatus(world.state(), 'op-over')).toBe('rejected');
    expect(
      await leaseDecision(world.memory.store, {
        reservationId: 'res-11',
        operationId: 'op-over',
      })
    ).toBe('release');
  });
});
