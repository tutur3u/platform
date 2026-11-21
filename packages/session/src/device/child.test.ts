import { describe, expect, it } from 'vitest';
import {
  createIssuer,
  createUpstream,
  testHashSecret,
} from '../__tests__/device-fakes';
import {
  createWorld,
  REGISTRY,
  reasonOf,
  USER_A,
  type World,
} from '../__tests__/device-fixtures';
import {
  type CommitOutcome,
  type DeviceMutation,
  type EmittedEffect,
  MAX_LIVE_CHILDREN,
  MAX_RETAINED_CHILDREN,
  resolve,
  runDrain,
  touchedSession,
} from '../device';

const MINUTE = 60_000;

async function parent(world: World) {
  const out = await world.signIn(USER_A);
  if (!out.result.ok) throw new Error('sign-in failed');
  return out.result.sessionId as string;
}

/** The parent triple a handoff code freezes at its authorizing resolution. */
function code(world: World) {
  const state = world.state();
  return {
    sid: state.activeSid as string,
    gen: state.gen,
    epoch: world.epochs[USER_A] ?? 0,
  };
}

function redeem(
  world: World,
  codeParent = code(world)
): Promise<CommitOutcome> {
  return world.commit({
    kind: 'redeem_child',
    operationId: world.nextOp(),
    nowMs: world.now,
    codeParent,
    child: { host: 'calendar.example.test', callback: '/after', kind: 'child' },
    epoch: world.epoch(USER_A),
  });
}

function childCookie(out: CommitOutcome) {
  const effect = out.effects.find(
    (entry): entry is Extract<EmittedEffect, { type: 'set_child_cookie' }> =>
      entry.type === 'set_child_cookie'
  );
  if (!effect?.secret) throw new Error('no child cookie');
  return effect;
}

async function resolveChild(world: World, out: CommitOutcome) {
  const cookie = childCookie(out);
  return resolve(
    world.state(),
    {
      secretHash: await testHashSecret(cookie.secret as Uint8Array),
      route: 'app.write',
      expectedSessionId: cookie.sessionId,
      epoch: world.epoch(USER_A),
      epochCache: {},
      nowMs: world.now,
    },
    REGISTRY
  );
}

const logout = (world: World, sessionId: string): DeviceMutation => ({
  kind: 'revoke',
  operationId: world.nextOp(),
  nowMs: world.now,
  fence: null,
  sessionId,
  reason: 'logout',
});

describe('redeem_child', () => {
  it('creates a child of a live parent that resolves on its own host secret', async () => {
    const world = createWorld();
    const sid = await parent(world);
    const version = world.state().version;
    const out = await redeem(world);
    expect(reasonOf(out)).toBe('ok');
    const cookie = childCookie(out);
    const row = world.state().sessions[cookie.sessionId];
    expect(row).toMatchObject({
      kind: 'child',
      parentSid: sid,
      host: 'calendar.example.test',
    });
    expect(world.state().version).toBe(version + 1);
    // The device generation and active session are untouched.
    expect(world.state().activeSid).toBe(sid);
    const resolved = await resolveChild(world, out);
    expect(resolved.kind === 'resolved' && resolved.sessionId).toBe(
      cookie.sessionId
    );
  });

  it('never outlives its parent: deadlines, cookie Max-Age and touch are capped', async () => {
    const world = createWorld();
    world.ctx.childPolicy = {
      idleMs: 400 * 24 * 60 * MINUTE,
      absoluteMs: 900 * 24 * 60 * MINUTE,
    };
    const sid = await parent(world);
    const out = await redeem(world);
    const cookie = childCookie(out);
    const parentRow = world.state().sessions[sid];
    const child = world.state().sessions[cookie.sessionId];
    expect(child?.absoluteExpiresAt).toBe(parentRow?.absoluteExpiresAt);
    expect(child?.idleExpiresAt).toBe(parentRow?.idleExpiresAt);
    expect(cookie.maxAgeSeconds).toBe(
      Math.floor(((parentRow?.absoluteExpiresAt ?? 0) - world.now) / 1000)
    );
    const touched = touchedSession(
      world.state(),
      cookie.sessionId,
      world.now + 3 * 24 * 60 * MINUTE
    );
    expect(touched?.idleExpiresAt).toBeLessThanOrEqual(
      parentRow?.idleExpiresAt ?? 0
    );
  });

  it('a child of a revoked or expired parent never resolves', async () => {
    const world = createWorld();
    const sid = await parent(world);
    const out = await redeem(world);
    await world.commit(logout(world, sid));
    const child = world.state().sessions[childCookie(out).sessionId];
    expect(child?.revokedAt).toBe(world.now);
    expect(child?.revokedReason).toBe('parent');
    expect((await resolveChild(world, out)).kind).toBe('signed_out');

    const other = createWorld(2);
    await parent(other);
    const live = await redeem(other);
    other.advance(7 * 24 * 60 * MINUTE);
    expect((await resolveChild(other, live)).kind).toBe('signed_out');
  });

  it('a child redeemed while its parent is revoked never resolves', async () => {
    const world = createWorld();
    const sid = await parent(world);
    const frozen = code(world);
    await world.commit(logout(world, sid));
    const out = await redeem(world, frozen);
    expect(reasonOf(out)).toBe('parent_unavailable');
    expect(out.effects).toEqual([]);
    expect(
      Object.values(world.state().sessions).filter(
        (row) => row.kind === 'child'
      )
    ).toEqual([]);
  });

  it('fails a code minted before the parent rotated or before an epoch bump', async () => {
    const world = createWorld();
    await parent(world);
    const beforeRotate = code(world);
    expect(
      reasonOf(
        await world.fenced<'rotate'>({
          kind: 'rotate',
          epoch: world.epoch(USER_A),
        })
      )
    ).toBe('ok');
    expect(reasonOf(await redeem(world, beforeRotate))).toBe(
      'parent_unavailable'
    );
    // The host can never substitute the current generation for another sid.
    expect(
      reasonOf(await redeem(world, { ...code(world), sid: 'someone-else' }))
    ).toBe('parent_unavailable');

    const stale = code(world);
    world.epochs[USER_A] = 1;
    const out = await redeem(world, stale);
    expect(reasonOf(out)).toBe('parent_unavailable');
    // The parent below the fresh epoch is revoked in the same commit.
    expect(out.result.revoked).toEqual([stale.sid]);
  });

  it(`refuses a child past ${MAX_LIVE_CHILDREN} live, and expired children never block one`, async () => {
    const world = createWorld();
    world.ctx.childPolicy = { idleMs: 10 * MINUTE, absoluteMs: 20 * MINUTE };
    await parent(world);
    for (let index = 0; index < MAX_LIVE_CHILDREN; index += 1) {
      expect(reasonOf(await redeem(world))).toBe('ok');
    }
    expect(reasonOf(await redeem(world))).toBe('rate_limited');
    world.advance(30 * MINUTE);
    expect(reasonOf(await redeem(world))).toBe('ok');
    const children = Object.values(world.state().sessions).filter(
      (row) => row.kind === 'child'
    );
    expect(children).toHaveLength(1);
  });

  it(`refuses a child past ${MAX_RETAINED_CHILDREN} retained rows, revoked ones included`, async () => {
    const world = createWorld();
    await parent(world);
    let retained = 0;
    while (retained < MAX_RETAINED_CHILDREN) {
      const out = await redeem(world);
      expect(reasonOf(out)).toBe('ok');
      await world.commit(logout(world, childCookie(out).sessionId));
      retained += 1;
    }
    expect(reasonOf(await redeem(world))).toBe('rate_limited');
  });

  it('the drain prunes expired children without a revoke', async () => {
    const world = createWorld();
    world.ctx.childPolicy = { idleMs: MINUTE, absoluteMs: 2 * MINUTE };
    await parent(world);
    const out = await redeem(world);
    world.advance(3 * MINUTE);
    await runDrain(
      world.memory.store,
      {
        upstream: createUpstream().port,
        issuers: {
          ai_token: createIssuer('ai_token', () => world.now).issuer,
          handoff_code: createIssuer('handoff_code', () => world.now).issuer,
        },
      },
      world.now
    );
    expect(world.state().sessions[childCookie(out).sessionId]).toBeUndefined();
    expect(world.state().outbox[childCookie(out).sessionId]).toBeUndefined();
  });

  it('logs a child out alone, clearing only its host cookie', async () => {
    const world = createWorld();
    const sid = await parent(world);
    const out = await redeem(world);
    const childSid = childCookie(out).sessionId;
    const loggedOut = await world.commit(logout(world, childSid));
    expect(loggedOut.cookie).toBe('clear');
    expect(world.state().outbox[childSid]?.effects.upstream).toBe('acked');
    expect(world.state().sessions[sid]?.revokedAt).toBeNull();
    expect(world.state().activeSid).toBe(sid);
  });
});
