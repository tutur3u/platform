import { describe, expect, it } from 'vitest';
import { createUserIndex } from '../__tests__/device-fakes';
import {
  createWorld,
  factorRead,
  fenceOf,
  outcomeFor,
  reasonOf,
  USER_A,
  type World,
} from '../__tests__/device-fixtures';
import {
  type ReservationClaim,
  type ReserveOutcome,
  signInWithReservation,
  type UserIndexPort,
} from '../device';

const VICTIM = 'device-victim';
const DEVICE = 'device-1';

function ids() {
  let next = 0;
  return () => `res-${++next}`;
}

function request(world: World, operationId: string, patch = {}) {
  return {
    operationId,
    nowMs: world.now,
    fence: world.state().version === 0 ? null : fenceOf(world.state()),
    outcome: outcomeFor(USER_A),
    capturedEpoch: 0,
    epoch: world.epoch(USER_A),
    factors: factorRead(USER_A, world.now),
    deviceId: DEVICE,
    cap: 1,
    ...patch,
  };
}

/** A user index at its cap of one, held by a confirmed victim device. */
async function indexAtCap() {
  const index = createUserIndex(ids());
  const victim = createWorld(9);
  const first = await signInWithReservation(
    { store: victim.memory.store, ctx: victim.ctx, index: index.port },
    { ...request(victim, 'op-victim'), deviceId: VICTIM }
  );
  expect(reasonOf(first)).toBe('ok');
  const victimSlot = index.slotOf(USER_A, VICTIM)?.reservationId as string;
  return { index, victimSlot };
}

type Call = { method: 'confirm' | 'release'; claim: ReservationClaim };

/** Wraps an index port, recording every confirm and release. */
function recording(port: UserIndexPort, reserve?: UserIndexPort['reserve']) {
  const calls: Call[] = [];
  const wrapped: UserIndexPort = {
    reserve: reserve ?? ((input) => port.reserve(input)),
    async confirm(claim) {
      calls.push({ method: 'confirm', claim });
      await port.confirm(claim);
    },
    async release(claim) {
      calls.push({ method: 'release', claim });
      await port.release(claim);
    },
  };
  return { port: wrapped, calls };
}

describe('index claims under racing sign-ins of one user on one device', () => {
  for (const order of ['loser first', 'winner first'] as const) {
    it(`keeps the winner confirmed and the victim evicted when the loser releases (${order})`, async () => {
      const { index, victimSlot } = await indexAtCap();
      const world = createWorld();
      const deps = { store: world.memory.store, ctx: world.ctx };
      // Both reserve before either commits, so they share one swapped slot.
      const winnerReserve = await index.port.reserve({
        userId: USER_A,
        deviceId: DEVICE,
        operationId: 'op-win',
        cap: 1,
        nowMs: world.now,
      });
      expect(winnerReserve.kind).toBe('swap');
      const slot = (winnerReserve as Extract<ReserveOutcome, { kind: 'swap' }>)
        .reservation.reservationId;
      const commitWinner = async () => {
        const out = await world.commit({
          ...request(world, 'op-win'),
          kind: 'sign_in',
          reservation: { reservationId: slot },
          eviction: { deviceId: VICTIM, reservationId: victimSlot },
        });
        expect(reasonOf(out)).toBe('ok');
        await index.port.confirm({
          reservationId: slot,
          operationId: 'op-win',
        });
      };
      const runLoser = async () => {
        const loser = recording(index.port);
        const out = await signInWithReservation(
          { ...deps, index: loser.port },
          request(world, 'op-lose', { capturedEpoch: 3 })
        );
        expect(reasonOf(out)).toBe('credentials_changed');
        expect(loser.calls).toEqual([
          {
            method: 'release',
            claim: { reservationId: slot, operationId: 'op-lose' },
          },
        ]);
      };
      if (order === 'loser first') {
        await runLoser();
        // The winner's claim keeps the provisional slot and its victim evicted.
        expect(index.slotOf(USER_A, DEVICE)?.reservationId).toBe(slot);
        expect(index.slotOf(USER_A, VICTIM)).toBeNull();
        await commitWinner();
      } else {
        await commitWinner();
        await runLoser();
      }
      expect(index.slotOf(USER_A, DEVICE)).toMatchObject({
        reservationId: slot,
        confirmed: true,
        claims: {},
      });
      expect(index.slotOf(USER_A, VICTIM)).toBeNull();
      expect(index.tombstones.has(`${USER_A}|${VICTIM}`)).toBe(true);
      const live = Object.values(world.state().sessions).filter(
        (row) => row.revokedAt === null
      );
      expect(live.map((row) => row.reservationId)).toEqual([slot]);
    });
  }

  it('evicts the victim from whichever claim commits on a provisional swap', async () => {
    const { index, victimSlot } = await indexAtCap();
    const world = createWorld();
    await index.port.reserve({
      userId: USER_A,
      deviceId: DEVICE,
      operationId: 'op-first',
      cap: 1,
      nowMs: world.now,
    });
    const out = await signInWithReservation(
      { store: world.memory.store, ctx: world.ctx, index: index.port },
      request(world, 'op-second')
    );
    expect(reasonOf(out)).toBe('ok');
    expect(out.effects).toContainEqual({
      type: 'evict_device',
      userId: USER_A,
      deviceId: VICTIM,
      reservationId: victimSlot,
    });
    // The first claim then fails; the slot stays with the committed sign-in.
    const slot = index.slotOf(USER_A, DEVICE)?.reservationId as string;
    await index.port.release({ reservationId: slot, operationId: 'op-first' });
    expect(index.slotOf(USER_A, DEVICE)?.confirmed).toBe(true);
    expect(index.slotOf(USER_A, VICTIM)).toBeNull();
  });

  it('ignores a release from an operation without a claim', async () => {
    const { index } = await indexAtCap();
    const world = createWorld();
    const reserved = await index.port.reserve({
      userId: USER_A,
      deviceId: DEVICE,
      operationId: 'op-only',
      cap: 1,
      nowMs: world.now,
    });
    const slot = (reserved as Extract<ReserveOutcome, { kind: 'swap' }>)
      .reservation.reservationId;
    await index.port.release({ reservationId: slot, operationId: 'op-stale' });
    expect(index.slotOf(USER_A, DEVICE)?.reservationId).toBe(slot);
    expect(index.slotOf(USER_A, VICTIM)).toBeNull();
    await index.port.release({ reservationId: slot, operationId: 'op-only' });
    expect(index.slotOf(USER_A, DEVICE)).toBeNull();
    expect(index.slotOf(USER_A, VICTIM)?.confirmed).toBe(true);
    expect(index.tombstones.size).toBe(0);
  });
});

describe('a retried sign-in whose stored record succeeded', () => {
  it('confirms after an idempotency_mismatch following a swap, and never releases', async () => {
    const { index, victimSlot } = await indexAtCap();
    const world = createWorld();
    const deps = { store: world.memory.store, ctx: world.ctx };
    // The first attempt commits a swap; its confirm is lost.
    const lost = recording(index.port);
    lost.port.confirm = async () => {
      throw new Error('index unreachable');
    };
    const first = await signInWithReservation(
      { ...deps, index: lost.port },
      request(world, 'op-x')
    );
    expect(reasonOf(first)).toBe('ok');
    expect(first.effects.some((e) => e.type === 'evict_device')).toBe(true);
    const slot = index.slotOf(USER_A, DEVICE)?.reservationId as string;
    expect(index.slotOf(USER_A, DEVICE)?.confirmed).toBe(false);

    // The retry rebuilds its body: the index reports the slot without its
    // swap, so the eviction is null, and the reads are newer.
    world.advance(1_000);
    const retry = recording(index.port, async (input) => {
      const out = await index.port.reserve(input);
      return out.kind === 'swap'
        ? { kind: 'reserved', reservation: out.reservation }
        : out;
    });
    const again = await signInWithReservation(
      { ...deps, index: retry.port },
      request(world, 'op-x')
    );
    expect(reasonOf(again)).toBe('idempotency_mismatch');
    expect(retry.calls).toEqual([
      {
        method: 'confirm',
        claim: { reservationId: slot, operationId: 'op-x' },
      },
    ]);
    expect(index.slotOf(USER_A, DEVICE)?.confirmed).toBe(true);
    expect(index.slotOf(USER_A, VICTIM)).toBeNull();
    expect(
      index.tombstones.get(`${USER_A}|${VICTIM}`)?.slot.reservationId
    ).toBe(victimSlot);
  });

  it('confirms the admitted slot and releases a retry claim on another slot', async () => {
    const world = createWorld();
    const first = await world.signIn(USER_A, {
      operationId: 'op-y',
      reservation: { reservationId: 'slot-admitted' },
    });
    expect(reasonOf(first)).toBe('ok');
    const index = createUserIndex(ids());
    const retry = recording(index.port, async () => ({
      kind: 'reserved',
      reservation: { reservationId: 'slot-retry' },
    }));
    world.advance(1_000);
    const again = await signInWithReservation(
      { store: world.memory.store, ctx: world.ctx, index: retry.port },
      request(world, 'op-y')
    );
    expect(reasonOf(again)).toBe('idempotency_mismatch');
    expect(retry.calls).toEqual([
      {
        method: 'confirm',
        claim: { reservationId: 'slot-admitted', operationId: 'op-y' },
      },
      {
        method: 'release',
        claim: { reservationId: 'slot-retry', operationId: 'op-y' },
      },
    ]);
  });

  it('settles nothing when the store cannot be read after a definite failure', async () => {
    const { index } = await indexAtCap();
    const world = createWorld();
    let reads = 0;
    const store = {
      ...world.memory.store,
      read: async () => {
        if (reads++ > 0) throw new Error('storage error');
        return world.memory.store.read();
      },
    };
    const spy = recording(index.port);
    const out = await signInWithReservation(
      { store, ctx: world.ctx, index: spy.port },
      request(world, 'op-z', { capturedEpoch: 4 })
    );
    expect(reasonOf(out)).toBe('credentials_changed');
    expect(spy.calls).toEqual([]);
    expect(index.slotOf(USER_A, DEVICE)?.confirmed).toBe(false);
  });
});
