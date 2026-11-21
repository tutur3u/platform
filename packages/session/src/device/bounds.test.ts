import { describe, expect, it } from 'vitest';
import {
  createWorld,
  epochRead,
  reasonOf,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import {
  type DeviceMutation,
  type DeviceState,
  EXPIRED_ID_TTL_MS,
  MAX_EXPIRED_IDS,
  MAX_RECORDS,
  mergeEpochCache,
  type OperationRecord,
  operationStatus,
  RECORD_TTL_MS,
  type RecordedKind,
  refreshRaise,
} from '../device';

function record(kind: RecordedKind, expiresAtMs: number): OperationRecord {
  return {
    kind,
    requestHash: new Uint8Array(32),
    result: { ok: false, reason: 'superseded', revoked: [] },
    effects: [],
    expiresAtMs,
  };
}

/** Fills the record maps directly, as a long-lived device would have them. */
function fill(
  world: World,
  records: { kind: RecordedKind; count: number },
  ids: { fencedOnly: boolean; count: number } = { fencedOnly: false, count: 0 }
) {
  const state: DeviceState = structuredClone(world.state());
  for (let index = 0; index < records.count; index += 1) {
    state.operations[`filled-${records.kind}-${index}`] = record(
      records.kind,
      world.now + RECORD_TTL_MS - index
    );
  }
  for (let index = 0; index < ids.count; index += 1) {
    state.expiredOperations[`gone-${index}`] = {
      expiredAtMs: world.now - index,
      fencedOnly: ids.fencedOnly,
    };
  }
  world.memory.state = state;
}

const activeUser = (world: World) =>
  (world.state().sessions[world.state().activeSid ?? '']?.userId ??
    USER_A) as typeof USER_A;
const rotate = (world: World) =>
  world.fenced<'rotate'>({
    kind: 'rotate',
    epoch: world.epoch(activeUser(world)),
  });

async function signedIn(world: World, userId = USER_A) {
  const out = await world.signIn(userId);
  if (!out.result.ok) throw new Error('sign-in failed');
  return out.result.sessionId as string;
}

describe('record bounds', () => {
  it('logout and both system revokes commit without a record when the maps are full', async () => {
    const world = createWorld();
    const a = await signedIn(world, USER_A);
    const b = await signedIn(world, USER_B);
    fill(
      world,
      { kind: 'sign_in', count: MAX_RECORDS },
      { fencedOnly: false, count: MAX_EXPIRED_IDS }
    );
    const maps = () => [
      world.state().operations,
      world.state().expiredOperations,
    ];
    const before = structuredClone(maps());
    expect(reasonOf(await rotate(world))).toBe('rate_limited');
    const revokes: DeviceMutation[] = [
      {
        kind: 'revoke',
        operationId: 'x1',
        nowMs: world.now,
        fence: null,
        sessionId: b,
        reason: 'logout',
      },
      {
        kind: 'revoke_user_below_epoch',
        operationId: 'x2',
        nowMs: world.now,
        userId: USER_A,
        belowEpoch: 1,
        bumpedAtMs: world.now,
      },
      {
        kind: 'revoke_user_on_device',
        operationId: 'x3',
        nowMs: world.now,
        userId: USER_A,
        reservationId: world.state().sessions[a]?.reservationId as string,
      },
    ];
    for (const mutation of revokes)
      expect(reasonOf(await world.commit(mutation))).toBe('ok');
    expect(world.state().sessions[a]?.revokedAt).not.toBeNull();
    expect(world.state().sessions[b]?.revokedAt).not.toBeNull();
    expect(maps()).toEqual(before);
  });

  it('keeps security records under switch and rotate churn, moving fenced-only ones early', async () => {
    const world = createWorld();
    await signedIn(world, USER_A);
    await signedIn(world, USER_B);
    fill(world, { kind: 'grant_step_up', count: MAX_RECORDS - 10 });
    const security = Object.keys(world.state().operations).filter((id) =>
      id.startsWith('filled-')
    );
    for (let index = 0; index < 60; index += 1) {
      const state = world.state();
      const target = Object.keys(state.sessions).find(
        (sid) => sid !== state.activeSid
      ) as string;
      const out =
        index % 2 === 0
          ? await rotate(world)
          : await world.fenced<'switch'>({
              kind: 'switch',
              targetSessionId: target,
              epoch: world.epoch(
                state.sessions[target]?.userId as typeof USER_A
              ),
            });
      expect(reasonOf(out)).toBe('ok');
      expect(Object.keys(world.state().operations).length).toBeLessThanOrEqual(
        MAX_RECORDS
      );
    }
    for (const id of security)
      expect(world.state().operations[id]).toBeDefined();
    const moved = Object.values(world.state().expiredOperations);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((entry) => entry.fencedOnly)).toBe(true);
  });

  it('drops the oldest fenced-only id early when the id map is full', async () => {
    const world = createWorld();
    await signedIn(world);
    expect(reasonOf(await rotate(world))).toBe('ok');
    world.advance(RECORD_TTL_MS);
    fill(
      world,
      { kind: 'rotate', count: 0 },
      { fencedOnly: true, count: MAX_EXPIRED_IDS }
    );
    // The aged rotate record adds one id; the oldest fenced-only id makes room.
    expect(reasonOf(await rotate(world))).toBe('ok');
    const ids = world.state().expiredOperations;
    expect(Object.keys(ids)).toHaveLength(MAX_EXPIRED_IDS);
    expect(ids[`gone-${MAX_EXPIRED_IDS - 1}`]).toBeUndefined();
  });

  it('rate limits when security records fill the records or security ids fill the ids', async () => {
    const world = createWorld();
    await signedIn(world);
    // The sign-in's own record plus the filled ones reach the cap.
    fill(world, { kind: 'consume_step_up', count: MAX_RECORDS - 1 });
    expect(reasonOf(await rotate(world))).toBe('rate_limited');

    const full = createWorld(2);
    await signedIn(full);
    fill(
      full,
      { kind: 'record_factors', count: 0 },
      { fencedOnly: false, count: MAX_EXPIRED_IDS }
    );
    // An aged security record would push a security id past the cap.
    full.advance(RECORD_TTL_MS);
    expect(reasonOf(await rotate(full))).toBe('rate_limited');
    expect(Object.keys(full.state().expiredOperations)).toHaveLength(
      MAX_EXPIRED_IDS
    );
  });
});

describe('replays across the record lifetime', () => {
  it('a security record replays, then fails as expired, and its id is kept 7 days', async () => {
    const world = createWorld();
    await signedIn(world);
    const grant: DeviceMutation = {
      kind: 'grant_step_up',
      operationId: 'op-grant',
      nowMs: world.now,
      fence: {
        sessionId: world.state().activeSid,
        gen: world.state().gen,
        version: world.state().version,
      },
      route: 'stepup.api_keys.create',
      params: { workspaceId: 'ws', keyName: 'k', role: 'member' },
      epoch: world.epoch(USER_A),
    };
    const out = await world.commit(grant);
    expect(reasonOf(out)).toBe('ok');
    const version = world.state().version;
    expect(
      (await world.commit({ ...grant, nowMs: world.now + 1 })).replayed
    ).toBe(true);
    world.advance(RECORD_TTL_MS);
    expect(reasonOf(await rotate(world))).toBe('ok');
    expect(reasonOf(await world.commit({ ...grant, nowMs: world.now }))).toBe(
      'expired_idempotency'
    );
    expect(operationStatus(world.state(), 'op-grant')).toBe('expired');
    expect(world.state().version).toBe(version + 1);
    world.advance(EXPIRED_ID_TTL_MS - 1);
    // Any recorded write ages the maps; a fresh sign-in is one.
    expect(reasonOf(await world.signIn(USER_B))).toBe('ok');
    expect(operationStatus(world.state(), 'op-grant')).toBe('expired');
    expect(reasonOf(await world.commit({ ...grant, nowMs: world.now }))).toBe(
      'expired_idempotency'
    );
  });

  it('a fenced-only record whose id is gone fails its fence instead of applying twice', async () => {
    const world = createWorld();
    await signedIn(world);
    const body: DeviceMutation = {
      kind: 'rotate',
      operationId: 'op-rot',
      nowMs: world.now,
      fence: {
        sessionId: world.state().activeSid,
        gen: world.state().gen,
        version: world.state().version,
      },
      epoch: world.epoch(USER_A),
    };
    expect(reasonOf(await world.commit(body))).toBe('ok');
    const state = structuredClone(world.state());
    delete state.operations['op-rot'];
    world.memory.state = state;
    const gen = world.state().gen;
    expect(reasonOf(await world.commit(body))).toBe('superseded');
    expect(world.state().gen).toBe(gen);
  });
});

describe('operationStatus for the index lease', () => {
  it('confirms only a succeeded sign-in, through its lease and after', async () => {
    const world = createWorld();
    const ok = await world.signIn(USER_A, { operationId: 'op-ok' });
    expect(reasonOf(ok)).toBe('ok');
    world.advance(60_000);
    expect(operationStatus(world.state(), 'op-ok')).toBe('succeeded');
    const rejected = await world.signIn(USER_B, {
      operationId: 'op-no',
      capturedEpoch: 3,
    });
    expect(reasonOf(rejected)).toBe('credentials_changed');
    expect(operationStatus(world.state(), 'op-no')).toBe('rejected');
    expect(operationStatus(world.state(), 'op-unknown')).toBe('absent');
    world.advance(RECORD_TTL_MS);
    await rotate(world);
    expect(operationStatus(world.state(), 'op-ok')).toBe('expired');
    world.advance(EXPIRED_ID_TTL_MS);
    expect(reasonOf(await world.signIn(USER_B))).toBe('ok');
    expect(operationStatus(world.state(), 'op-ok')).toBe('absent');
  });
});

describe('epoch cache', () => {
  it('replaces an entry only with a higher epoch, or an equal one read later', () => {
    const cache = mergeEpochCache({}, [
      { userId: USER_A, epoch: 4, readAtMs: 100 },
    ]);
    expect(
      mergeEpochCache(cache, [{ userId: USER_A, epoch: 3, readAtMs: 999 }])[
        USER_A
      ]
    ).toEqual({ epoch: 4, readAtMs: 100 });
    expect(
      mergeEpochCache(cache, [{ userId: USER_A, epoch: 4, readAtMs: 99 }])[
        USER_A
      ]
    ).toEqual({ epoch: 4, readAtMs: 100 });
    expect(
      mergeEpochCache(cache, [{ userId: USER_A, epoch: 4, readAtMs: 101 }])[
        USER_A
      ]
    ).toEqual({ epoch: 4, readAtMs: 101 });
    expect(
      mergeEpochCache(cache, [{ userId: USER_A, epoch: 5, readAtMs: 1 }])[
        USER_A
      ]
    ).toEqual({ epoch: 5, readAtMs: 1 });
  });

  it('refreshes only from a fresh read at most 5 seconds old', () => {
    const now = 10_000;
    expect(refreshRaise(epochRead(USER_A, 2, now - 5_000), now)).toEqual({
      userId: USER_A,
      epoch: 2,
      readAtMs: 5_000,
    });
    expect(refreshRaise(epochRead(USER_A, 2, now - 5_001), now)).toBeNull();
    expect(refreshRaise(epochRead(USER_A, 2, now + 1), now)).toBeNull();
    expect(refreshRaise(epochRead(USER_A, 2, now, 'stale'), now)).toBeNull();
  });

  it('never lowers under a concurrent versioned commit carrying an older read', async () => {
    const world = createWorld();
    await signedIn(world);
    const bumpedAt = world.now;
    await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: world.nextOp(),
      nowMs: world.now + 2_000,
      userId: USER_A,
      belowEpoch: 5,
      bumpedAtMs: bumpedAt,
    });
    // A sign-in read epoch 3 before the bump landed, and commits after it.
    world.epochs[USER_A] = 3;
    expect(reasonOf(await world.signIn(USER_A))).toBe('ok');
    expect(world.memory.cache[USER_A]).toEqual({
      epoch: 5,
      readAtMs: bumpedAt,
    });
    await world.memory.store.refreshEpochCache(
      epochRead(USER_A, 4, world.now),
      world.now
    );
    expect(world.memory.cache[USER_A]).toEqual({
      epoch: 5,
      readAtMs: bumpedAt,
    });
  });
});

describe('device revoke by slot', () => {
  it('the evicted slot id revokes; an earlier or later id does not', async () => {
    const world = createWorld();
    await world.signIn(USER_A, {
      reservation: { reservationId: 'slot-early' },
    });
    await world.signIn(USER_A, {
      reservation: { reservationId: 'slot-evicted' },
    });
    const current = world.state().activeSid as string;
    const revoke = (reservationId: string): DeviceMutation => ({
      kind: 'revoke_user_on_device',
      operationId: world.nextOp(),
      nowMs: world.now,
      userId: USER_A,
      reservationId,
    });
    const early = await world.commit(revoke('slot-early'));
    expect(early.result.revoked).toEqual([]);
    expect(reasonOf(await world.commit(revoke('slot-later')))).toBe(
      'not_found'
    );
    expect(world.state().sessions[current]?.revokedAt).toBeNull();
    const evicted = await world.commit(revoke('slot-evicted'));
    expect(evicted.result.revoked).toEqual([current]);
  });
});
