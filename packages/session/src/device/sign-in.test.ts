import { describe, expect, it } from 'vitest';
import { createUserIndex } from '../__tests__/device-fakes';
import {
  createWorld,
  effectTypes,
  epochRead,
  factorRead,
  MFA_PASSKEY,
  outcomeFor,
  reasonOf,
  SIGN_IN_PASSKEY,
  TOTP,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import {
  leaseDecision,
  operationStatus,
  type SessionFactor,
  type SignInOutcome,
  signInWithReservation,
} from '../device';

async function signInAs(
  world: World,
  factors: SessionFactor[],
  outcome: Partial<SignInOutcome>
) {
  world.factors[USER_A] = factors;
  return world.signIn(USER_A, { outcome: outcomeFor(USER_A, outcome) });
}

describe('sign_in factor rules', () => {
  it('rejects a password-only sign-in for a user with totp or an MFA passkey, whatever the aal label', async () => {
    for (const factor of [TOTP, MFA_PASSKEY]) {
      const out = await signInAs(createWorld(), [factor], {
        amr: ['pwd'],
        aal: 'aal2',
      });
      expect(reasonOf(out)).toBe('second_factor_required');
      expect(effectTypes(out)).toContain('index_release');
    }
  });

  it('accepts totp and stores secondFactorSatisfied', async () => {
    const world = createWorld();
    const out = await signInAs(world, [TOTP], {
      amr: ['pwd', 'totp'],
      aal: 'aal2',
    });
    expect(reasonOf(out)).toBe('ok');
    const row = world.state().sessions[world.state().activeSid as string];
    expect(row?.secondFactorSatisfied).toBe(true);
    expect(row?.factors).toEqual([TOTP]);
  });

  it('rejects a passkey without user verification for a user with an MFA passkey', async () => {
    const out = await signInAs(createWorld(), [MFA_PASSKEY], {
      amr: ['passkey'],
    });
    expect(reasonOf(out)).toBe('second_factor_required');
    const verified = await signInAs(createWorld(), [MFA_PASSKEY], {
      amr: ['passkey'],
      passkeyUserVerified: true,
    });
    expect(reasonOf(verified)).toBe('ok');
  });

  it('accepts a passkey sign-in for a passkey-only user without marking a second factor', async () => {
    const world = createWorld();
    const out = await signInAs(world, [SIGN_IN_PASSKEY], { amr: ['passkey'] });
    expect(reasonOf(out)).toBe('ok');
    expect(
      world.state().sessions[world.state().activeSid as string]
        ?.secondFactorSatisfied
    ).toBe(false);
  });

  it('rejects an amr method the fresh read does not hold', async () => {
    expect(reasonOf(await signInAs(createWorld(), [], { amr: ['totp'] }))).toBe(
      'factor_mismatch'
    );
    expect(
      reasonOf(await signInAs(createWorld(), [TOTP], { amr: ['passkey'] }))
    ).toBe('factor_mismatch');
  });

  it('fails closed on an unavailable, lagging or foreign factor read', async () => {
    const world = createWorld();
    expect(
      reasonOf(await world.signIn(USER_A, { factors: 'unavailable' }))
    ).toBe('factors_unavailable');
    const lagging = factorRead(USER_A, world.now - 5_001);
    expect(reasonOf(await world.signIn(USER_A, { factors: lagging }))).toBe(
      'invalid_operation'
    );
    const foreign = factorRead(USER_B, world.now);
    expect(reasonOf(await world.signIn(USER_A, { factors: foreign }))).toBe(
      'invalid_operation'
    );
    expect(world.state().version).toBe(0);
  });

  it('fails closed on a stale or unavailable epoch and rejects another user read', async () => {
    const world = createWorld();
    for (const status of ['stale', 'unavailable'] as const) {
      expect(
        reasonOf(
          await world.signIn(USER_A, { epoch: world.epoch(USER_A, status) })
        )
      ).toBe('epoch_unavailable');
    }
    expect(
      reasonOf(
        await world.signIn(USER_A, { epoch: epochRead(USER_B, 0, world.now) })
      )
    ).toBe('invalid_operation');
  });
});

describe('sign_in epochs and sessions', () => {
  it('returns credentials_changed when the captured epoch moved, storing a rejected record', async () => {
    const world = createWorld();
    world.epochs[USER_A] = 2;
    const out = await world.signIn(USER_A, {
      capturedEpoch: 1,
      operationId: 'op-cc',
    });
    expect(reasonOf(out)).toBe('credentials_changed');
    expect(Object.keys(world.state().sessions)).toEqual([]);
    expect(operationStatus(world.state(), 'op-cc')).toBe('rejected');
  });

  it('sets epochSeen and the reservation, and replaces the same user on the device', async () => {
    const world = createWorld();
    world.epochs[USER_A] = 4;
    const first = await world.signIn(USER_A);
    const second = await world.signIn(USER_A);
    const state = world.state();
    const firstSid = first.result.ok ? (first.result.sessionId as string) : '';
    const secondSid = second.result.ok
      ? (second.result.sessionId as string)
      : '';
    expect(state.sessions[secondSid]?.epochSeen).toBe(4);
    expect(state.sessions[secondSid]?.reservationId).toMatch(/^slot-/);
    expect(state.sessions[firstSid]?.revokedReason).toBe('replaced');
    expect(second.result.ok && second.result.revoked).toEqual([firstSid]);
    expect(effectTypes(second)).toContain('revoke_upstream');
  });

  it('adds a saved account, invalidating the previous tab account', async () => {
    const world = createWorld();
    const first = await world.signIn(USER_A);
    const second = await world.signIn(USER_B);
    const firstSid = first.result.ok ? first.result.sessionId : null;
    expect(second.effects).toContainEqual({
      type: 'tab_invalidate',
      sessionId: firstSid,
    });
    expect(Object.keys(world.state().sessions)).toHaveLength(2);
  });
});

describe('sign_in with the user index', () => {
  const ids = () => {
    let next = 0;
    return () => `res-${++next}`;
  };

  it('returns retry_later for an evicting device and unavailable when the index is down', async () => {
    const world = createWorld();
    const index = createUserIndex(ids());
    const request = (operationId: string) => ({
      operationId,
      nowMs: world.now,
      fence: null,
      outcome: outcomeFor(USER_A),
      capturedEpoch: 0,
      epoch: world.epoch(USER_A),
      factors: factorRead(USER_A, world.now),
      deviceId: 'device-1',
      cap: 1,
    });
    index.tombstones.set(`${USER_A}|device-1`, {
      userId: USER_A,
      deviceId: 'device-1',
      slot: {
        reservationId: 'x',
        confirmed: true,
        lastSeenAt: 0,
        claims: {},
        victim: null,
      },
    });
    const deps = {
      store: world.memory.store,
      ctx: world.ctx,
      index: index.port,
    };
    expect(reasonOf(await signInWithReservation(deps, request('op-1')))).toBe(
      'retry_later'
    );
    index.tombstones.clear();
    index.setAvailable(false);
    expect(reasonOf(await signInWithReservation(deps, request('op-2')))).toBe(
      'unavailable'
    );
  });

  it('swaps the oldest device, emits its slot revoke, and confirms; a failed sign-in restores the victim', async () => {
    const index = createUserIndex(ids());
    const victim = createWorld(2);
    const deps = (world: World) => ({
      store: world.memory.store,
      ctx: world.ctx,
      index: index.port,
    });
    const request = (world: World, operationId: string, patch = {}) => ({
      operationId,
      nowMs: world.now,
      fence: null,
      outcome: outcomeFor(USER_A),
      capturedEpoch: 0,
      epoch: world.epoch(USER_A),
      factors: factorRead(USER_A, world.now),
      cap: 1,
      ...patch,
    });
    const first = await signInWithReservation(deps(victim), {
      ...request(victim, 'op-v'),
      deviceId: 'device-victim',
    });
    expect(reasonOf(first)).toBe('ok');
    expect(index.slotOf(USER_A, 'device-victim')?.confirmed).toBe(true);

    // A credentials_changed sign-in after a swap restores the evicted device.
    const failing = createWorld(3);
    const rejected = await signInWithReservation(deps(failing), {
      ...request(failing, 'op-f', { capturedEpoch: 7 }),
      deviceId: 'device-new',
    });
    expect(reasonOf(rejected)).toBe('credentials_changed');
    expect(index.slotOf(USER_A, 'device-victim')?.confirmed).toBe(true);
    expect(index.slotOf(USER_A, 'device-new')).toBeNull();
    expect(index.tombstones.size).toBe(0);

    const winner = createWorld(4);
    const swapped = await signInWithReservation(deps(winner), {
      ...request(winner, 'op-w'),
      deviceId: 'device-winner',
    });
    expect(reasonOf(swapped)).toBe('ok');
    const evict = swapped.effects.find(
      (effect) => effect.type === 'evict_device'
    );
    expect(evict).toMatchObject({
      deviceId: 'device-victim',
      reservationId: index.tombstones.get(`${USER_A}|device-victim`)?.slot
        .reservationId,
    });
    expect(index.slotOf(USER_A, 'device-winner')?.confirmed).toBe(true);
    const winnerSlot = index.slotOf(USER_A, 'device-winner')
      ?.reservationId as string;
    const claim = (operationId: string) => ({
      reservationId: winnerSlot,
      operationId,
    });
    expect(await leaseDecision(winner.memory.store, claim('op-w'))).toBe(
      'confirm'
    );
    expect(await leaseDecision(failing.memory.store, claim('op-f'))).toBe(
      'release'
    );
    expect(await leaseDecision(failing.memory.store, claim('op-never'))).toBe(
      'release'
    );
    // A claim on a slot other than the one the sign-in was admitted under.
    expect(
      await leaseDecision(winner.memory.store, {
        reservationId: 'res-other',
        operationId: 'op-w',
      })
    ).toBe('release');
  });

  it('keeps a committed sign-in succeeded through its lease after a lost acknowledgement', async () => {
    const index = createUserIndex(ids());
    const world = createWorld();
    world.memory.onWrite(() => 'unknown_committed');
    const out = await signInWithReservation(
      { store: world.memory.store, ctx: world.ctx, index: index.port },
      {
        operationId: 'op-lost',
        nowMs: world.now,
        fence: null,
        outcome: outcomeFor(USER_A),
        capturedEpoch: 0,
        epoch: world.epoch(USER_A),
        factors: factorRead(USER_A, world.now),
        deviceId: 'device-1',
        cap: 3,
      }
    );
    world.memory.onWrite(null);
    expect(reasonOf(out)).toBe('ok');
    world.advance(60_000);
    expect(operationStatus(world.state(), 'op-lost')).toBe('succeeded');
    expect(
      await leaseDecision(world.memory.store, {
        reservationId: index.slotOf(USER_A, 'device-1')
          ?.reservationId as string,
        operationId: 'op-lost',
      })
    ).toBe('confirm');
    expect(index.slotOf(USER_A, 'device-1')?.confirmed).toBe(true);
  });
});
