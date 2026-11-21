import { describe, expect, it } from 'vitest';
import { testHashSecret } from '../__tests__/device-fakes';
import {
  createWorld,
  epochRead,
  REGISTRY,
  reasonOf,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import {
  type DeviceState,
  type EpochRead,
  GRACE_MS,
  resolve,
  type ResolveInput,
} from '../device';

async function signedIn(world: World) {
  const out = await world.signIn(USER_A);
  const sid = out.result.ok ? (out.result.sessionId as string) : '';
  return { sid, secretHash: await testHashSecret(world.secretOf(out)) };
}

function input(
  world: World,
  patch: Partial<ResolveInput> & { secretHash: Uint8Array }
): ResolveInput {
  return {
    route: 'app.write',
    expectedSessionId: world.state().activeSid,
    epoch: world.epoch(USER_A),
    epochCache: world.memory.cache,
    nowMs: world.now,
    ...patch,
  };
}

const kindOf = (state: DeviceState, value: ResolveInput) =>
  resolve(state, value, REGISTRY).kind;

describe('resolve', () => {
  it('resolves the current secret for every route and is a pure read', async () => {
    const world = createWorld();
    const { sid, secretHash } = await signedIn(world);
    const before = structuredClone(world.state());
    for (const route of [
      'app.read',
      'app.write',
      'auth.ai_token.mint',
      'unknown.route',
    ]) {
      const result = resolve(
        world.state(),
        input(world, { secretHash, route }),
        REGISTRY
      );
      expect(result.kind).toBe('resolved');
      if (result.kind === 'resolved') {
        expect(result.sessionId).toBe(sid);
        expect(result.stale).toBe(false);
      }
    }
    expect(world.state()).toEqual(before);
  });

  it('serves the grace secret only to read routes, stale, until its deadline', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    const rotated = await world.fenced<'rotate'>({
      kind: 'rotate',
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(rotated)).toBe('ok');
    const state = world.state();
    const read = resolve(
      state,
      input(world, { secretHash, route: 'app.read' }),
      REGISTRY
    );
    expect(read.kind === 'resolved' && read.stale && read.graceDeadlineMs).toBe(
      world.now + GRACE_MS
    );
    expect(read.kind === 'resolved' && read.touch).toBe(false);
    for (const route of [
      'app.write',
      'auth.ai_token.mint',
      'auth.handoff.mint',
      'unknown.route',
    ]) {
      expect(kindOf(state, input(world, { secretHash, route }))).toBe(
        'rotated'
      );
    }
    world.advance(GRACE_MS);
    expect(
      kindOf(world.state(), input(world, { secretHash, route: 'app.read' }))
    ).toBe('signed_out');
  });

  it('requires the expected account on account-scoped routes and rejects a mismatch', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    const state = world.state();
    expect(
      kindOf(state, input(world, { secretHash, expectedSessionId: null }))
    ).toBe('account_mismatch');
    expect(
      kindOf(state, input(world, { secretHash, expectedSessionId: 'other' }))
    ).toBe('account_mismatch');
    expect(
      kindOf(
        state,
        input(world, { secretHash, route: 'unknown', expectedSessionId: null })
      )
    ).toBe('account_mismatch');
    expect(
      kindOf(
        state,
        input(world, {
          secretHash,
          route: 'app.public_read',
          expectedSessionId: null,
        })
      )
    ).toBe('resolved');
  });

  it('uses a cached epoch for read routes within 30 seconds during an outage, and fails closed past it', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    const outage = world.epoch(USER_A, 'unavailable');
    world.advance(30_000);
    const state = world.state();
    expect(
      kindOf(
        state,
        input(world, { secretHash, route: 'app.read', epoch: outage })
      )
    ).toBe('resolved');
    expect(
      kindOf(
        state,
        input(world, { secretHash, route: 'app.write', epoch: outage })
      )
    ).toBe('epoch_unavailable');
    world.advance(1);
    expect(
      kindOf(
        state,
        input(world, { secretHash, route: 'app.read', epoch: outage })
      )
    ).toBe('epoch_unavailable');
    const stale: EpochRead = { ...world.epoch(USER_A), status: 'stale' };
    expect(
      kindOf(
        state,
        input(world, { secretHash, route: 'app.read', epoch: stale })
      )
    ).toBe('epoch_unavailable');
  });

  it('signs out a revoked or expired session before any epoch check, even with a young cache', async () => {
    const world = createWorld();
    const { sid, secretHash } = await signedIn(world);
    const revoked = structuredClone(world.state());
    (revoked.sessions[sid] as { revokedAt: number | null }).revokedAt =
      world.now;
    expect(
      kindOf(
        revoked,
        input(world, { secretHash, route: 'app.read', epoch: null })
      )
    ).toBe('signed_out');
    const expired = structuredClone(world.state());
    (expired.sessions[sid] as { idleExpiresAt: number }).idleExpiresAt =
      world.now;
    expect(
      kindOf(
        expired,
        input(world, { secretHash, route: 'app.read', epoch: null })
      )
    ).toBe('signed_out');
  });

  it('signs out a session below the epoch used and names the revocation to commit', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    const result = resolve(
      world.state(),
      input(world, { secretHash, epoch: epochRead(USER_A, 1, world.now) }),
      REGISTRY
    );
    expect(result).toEqual({
      kind: 'signed_out',
      epochRevoke: { userId: USER_A, belowEpoch: 1, bumpedAtMs: world.now },
    });
  });

  it('stops a reached device at once after revoke_user_below_epoch, whatever the read says', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    const out = await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: 'fan-out',
      nowMs: world.now,
      userId: USER_A,
      belowEpoch: 1,
      bumpedAtMs: world.now - 10_000,
    });
    expect(reasonOf(out)).toBe('ok');
    expect(world.memory.cache[USER_A]).toEqual({
      epoch: 1,
      readAtMs: world.now - 10_000,
    });
    expect(
      kindOf(
        world.state(),
        input(world, { secretHash, route: 'app.read', epoch: null })
      )
    ).toBe('signed_out');
  });

  it('rejects an epoch read for another user and a fresh read older than 5 seconds', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    const state = world.state();
    const other = epochRead(USER_B, 0, world.now);
    expect(kindOf(state, input(world, { secretHash, epoch: other }))).toBe(
      'invalid_operation'
    );
    const lagging = epochRead(USER_A, 0, world.now - 5_001);
    expect(kindOf(state, input(world, { secretHash, epoch: lagging }))).toBe(
      'invalid_operation'
    );
  });

  it('signs out an unknown secret and asks for a touch at most every 5 minutes', async () => {
    const world = createWorld();
    const { secretHash } = await signedIn(world);
    expect(
      kindOf(world.state(), input(world, { secretHash: new Uint8Array(32) }))
    ).toBe('signed_out');
    expect(
      kindOf(world.state(), input(world, { secretHash: new Uint8Array(0) }))
    ).toBe('signed_out');
    const early = resolve(
      world.state(),
      input(world, { secretHash }),
      REGISTRY
    );
    expect(early.kind === 'resolved' && early.touch).toBe(false);
    world.advance(5 * 60_000);
    const late = resolve(world.state(), input(world, { secretHash }), REGISTRY);
    expect(late.kind === 'resolved' && late.touch).toBe(true);
  });

  it('refreshes the cache only from a fresh read at most 5 seconds old, never lowering it', async () => {
    const world = createWorld();
    await signedIn(world);
    const { store } = world.memory;
    await store.refreshEpochCache(epochRead(USER_A, 3, world.now), world.now);
    await store.refreshEpochCache(
      epochRead(USER_A, 2, world.now + 1),
      world.now + 1
    );
    await store.refreshEpochCache(
      epochRead(USER_A, 4, world.now - 6_000),
      world.now
    );
    await store.refreshEpochCache(
      epochRead(USER_A, 5, world.now, 'stale'),
      world.now
    );
    expect(world.memory.cache[USER_A]).toEqual({
      epoch: 3,
      readAtMs: world.now,
    });
  });
});
