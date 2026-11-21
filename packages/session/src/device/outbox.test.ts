import { describe, expect, it } from 'vitest';
import {
  createIssuer,
  createUpstream,
  testHashSecret,
} from '../__tests__/device-fakes';
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
  acknowledgeEffects,
  DRAIN_DELAYS_MS,
  type DeviceMutation,
  type EffectResult,
  MAX_DRAIN_ATTEMPTS,
  MIN_TOMBSTONE_LIFETIME_MS,
  mintAllowed,
  mintAuthority,
  planDrain,
  REVOKED_RESERVATION_RETENTION_MS,
  REVOKED_ROW_RETENTION_MS,
  runDrain,
  settleResponseCookie,
  tombstoneLifetimeMs,
  watermarkLifetimeMs,
} from '../device';

const DAY = 24 * 60 * 60_000;

function ports(world: World) {
  const upstream = createUpstream();
  const ai = createIssuer('ai_token', () => world.now);
  const handoff = createIssuer('handoff_code', () => world.now);
  return {
    upstream,
    ai,
    handoff,
    drain: () =>
      runDrain(
        world.memory.store,
        {
          upstream: upstream.port,
          issuers: { ai_token: ai.issuer, handoff_code: handoff.issuer },
        },
        world.now
      ),
  };
}

const logout = (world: World, sessionId: string): DeviceMutation => ({
  kind: 'revoke',
  operationId: world.nextOp(),
  nowMs: world.now,
  fence: null,
  sessionId,
  reason: 'logout',
});

async function signedIn(world: World, userId = USER_A, grant = true) {
  const out = await world.signIn(
    userId,
    grant ? {} : { outcome: { ...outcomeOf(world, userId), grant: null } }
  );
  if (!out.result.ok) throw new Error('sign-in failed');
  return { sid: out.result.sessionId as string, secret: world.secretOf(out) };
}

function outcomeOf(world: World, userId: typeof USER_A) {
  return {
    kind: 'authenticated' as const,
    provider: 'supabase' as const,
    providerSubject: `s-${userId.slice(0, 4)}`,
    userId,
    aal: 'aal1' as const,
    amr: ['pwd' as const],
    grant: null,
    passkeyUserVerified: false,
    sessionKind: 'browser' as const,
  };
}

async function authority(
  world: World,
  secret: Uint8Array,
  route = 'auth.ai_token.mint'
) {
  return mintAuthority(
    world.state(),
    {
      secretHash: await testHashSecret(secret),
      route,
      expectedSessionId: world.state().activeSid,
      epoch: epochRead(USER_A, world.epochs[USER_A] ?? 0, world.now),
      epochCache: world.memory.cache,
      nowMs: world.now,
    },
    REGISTRY
  );
}

describe('drain', () => {
  it('retries an upstream outage on its schedule until it succeeds', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    await world.commit(logout(world, sid));
    p.upstream.failNext(2);
    // Not due before the first minute.
    expect((await p.drain()).attempted).toBe(0);
    world.advance(DRAIN_DELAYS_MS[0] as number);
    await p.drain();
    expect(world.state().outbox[sid]?.attempts.upstream).toBe(1);
    expect(world.state().outbox[sid]?.effects.credentials).toEqual({
      ai_token: 'acked',
      handoff_code: 'acked',
    });
    world.advance((DRAIN_DELAYS_MS[1] as number) - 1);
    expect((await p.drain()).attempted).toBe(0);
    world.advance(1);
    await p.drain();
    world.advance(DRAIN_DELAYS_MS[2] as number);
    await p.drain();
    expect(world.state().outbox[sid]?.effects.upstream).toBe('acked');
    expect(world.state().outbox[sid]?.upstream).toBeNull();
    expect(p.upstream.revoked).toHaveLength(1);
  });

  it('abandons only the failing effect after its fifth failure, with an alert, and never re-emits it', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    await world.commit(logout(world, sid));
    p.upstream.failAlways();
    p.handoff.failNext(1);
    const alerts = [];
    for (const delay of DRAIN_DELAYS_MS) {
      world.advance(delay);
      alerts.push(...(await p.drain()).alerts);
    }
    const row = world.state().outbox[sid];
    expect(row?.attempts.upstream).toBe(MAX_DRAIN_ATTEMPTS);
    expect(row?.effects).toEqual({
      upstream: 'abandoned',
      cookie: 'acked',
      credentials: { ai_token: 'acked', handoff_code: 'acked' },
    });
    expect(alerts).toEqual([{ key: sid, effect: 'upstream' }]);
    expect(planDrain(world.state(), world.now + DAY)).toEqual([]);
    const replay = await world.commit(logout(world, sid));
    expect(replay.result.ok && replay.result.alreadyRevoked).toBe(true);
    expect(replay.effects).toEqual([]);
  });

  it('counts a failure once when the drain write loses its acknowledgement', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    await world.commit(logout(world, sid));
    p.upstream.failAlways();
    world.advance(DRAIN_DELAYS_MS[0] as number);
    world.memory.faults.push('unknown_committed');
    await p.drain();
    expect(world.state().outbox[sid]?.attempts.upstream).toBe(1);
  });

  it('keeps one issuer pending when only the other acknowledged', async () => {
    const world = createWorld();
    const { sid } = await signedIn(world, USER_A, false);
    await world.commit(logout(world, sid));
    const results: EffectResult[] = [
      {
        key: sid,
        effect: 'credentials',
        issuer: 'ai_token',
        sessionId: sid,
        before: null,
        ok: true,
      },
      {
        key: sid,
        effect: 'credentials',
        issuer: 'handoff_code',
        sessionId: sid,
        before: null,
        ok: false,
      },
    ];
    expect(
      await acknowledgeEffects(world.memory.store, results, world.now)
    ).toBe(true);
    const row = world.state().outbox[sid];
    expect(row?.effects.credentials).toEqual({
      ai_token: 'acked',
      handoff_code: 'pending',
    });
    // A host-side failure spends no drain attempt.
    expect(row?.attempts.credentials.handoff_code).toBe(0);
    world.advance(REVOKED_ROW_RETENTION_MS);
    const p = ports(world);
    p.handoff.failNext(1);
    await p.drain();
    expect(world.state().sessions[sid]).toBeDefined();
  });

  it('acknowledges a credentials effect only after the issuer wrote its tombstone', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    await world.commit(logout(world, sid));
    p.ai.failNext(1);
    world.advance(DRAIN_DELAYS_MS[0] as number);
    await p.drain();
    expect(p.ai.tombstones.has(sid)).toBe(false);
    expect(world.state().outbox[sid]?.effects.credentials.ai_token).toBe(
      'pending'
    );
    world.advance(DRAIN_DELAYS_MS[1] as number);
    await p.drain();
    expect(p.ai.tombstones.has(sid)).toBe(true);
    expect(world.state().outbox[sid]?.effects.credentials.ai_token).toBe(
      'acked'
    );
  });

  it('prunes a revoked session with nothing minted after 7 days, even on an offline device', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world, USER_A, false);
    // A system revoke: its cookie effect waits for a response that never comes.
    await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: world.nextOp(),
      nowMs: world.now,
      userId: USER_A,
      belowEpoch: 1,
      bumpedAtMs: world.now,
    });
    expect(world.state().outbox[sid]?.effects.upstream).toBe('acked');
    world.advance(DRAIN_DELAYS_MS[0] as number);
    await p.drain();
    expect(world.state().outbox[sid]?.effects.cookie).toBe('pending');
    world.advance(
      REVOKED_ROW_RETENTION_MS - (DRAIN_DELAYS_MS[0] as number) - 1
    );
    await p.drain();
    expect(world.state().sessions[sid]).toBeDefined();
    world.advance(1);
    await p.drain();
    expect(world.state().sessions[sid]).toBeUndefined();
    expect(world.state().outbox[sid]).toBeUndefined();
  });

  it('sweeps slot ids after 30 days; a late slot revoke after the prune answers already_revoked', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    const slot = world.state().sessions[sid]?.reservationId as string;
    const slotRevoke = (): DeviceMutation => ({
      kind: 'revoke_user_on_device',
      operationId: world.nextOp(),
      nowMs: world.now,
      userId: USER_A,
      reservationId: slot,
    });
    await world.commit(slotRevoke());
    world.advance(REVOKED_ROW_RETENTION_MS + DAY);
    await p.drain();
    expect(world.state().sessions[sid]).toBeUndefined();
    const late = await world.commit(slotRevoke());
    expect(late.result.ok && late.result.alreadyRevoked).toBe(true);
    world.advance(REVOKED_RESERVATION_RETENTION_MS);
    await p.drain();
    expect(world.state().revokedReservations).toEqual({});
  });
});

describe('cookie effects', () => {
  it('a system revoke cookie waits for the next response and never spends an attempt', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    await world.commit({
      kind: 'revoke_user_on_device',
      operationId: world.nextOp(),
      nowMs: world.now,
      userId: USER_A,
      reservationId: world.state().sessions[sid]?.reservationId as string,
    });
    for (const delay of DRAIN_DELAYS_MS) {
      world.advance(delay);
      await p.drain();
    }
    expect(world.state().outbox[sid]?.effects.cookie).toBe('pending');
    expect(
      await settleResponseCookie(world.memory.store, world.now, {
        kind: 'device',
      })
    ).toBe('clear');
    expect(world.state().outbox[sid]?.effects.cookie).toBe('acked');
    expect(
      await settleResponseCookie(world.memory.store, world.now, {
        kind: 'device',
      })
    ).toBeNull();
  });

  it('is superseded, leaving the current cookie, once the generation moved on', async () => {
    const world = createWorld();
    const { sid } = await signedIn(world, USER_A);
    await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: world.nextOp(),
      nowMs: world.now,
      userId: USER_A,
      belowEpoch: 1,
      bumpedAtMs: world.now,
    });
    await signedIn(world, USER_B);
    expect(
      await settleResponseCookie(world.memory.store, world.now, {
        kind: 'device',
      })
    ).toBeNull();
    expect(world.state().outbox[sid]?.effects.cookie).toBe('superseded');
  });
});

describe('session credential issuers', () => {
  it('a mint and a revoke racing under the per-sid lock never leave a live credential', async () => {
    for (const order of ['mint-first', 'revoke-first'] as const) {
      const world = createWorld();
      const { issuer } = createIssuer('ai_token', () => world.now);
      const credential = { id: `c-${order}`, sid: 'sid-1' };
      const mint = () => issuer.mint('sid-1', world.now, credential);
      const revoke = () => issuer.revokeForSession('sid-1');
      const [first, second] =
        order === 'mint-first' ? [mint, revoke] : [revoke, mint];
      await Promise.all([first(), second()]);
      expect(await issuer.validate(credential)).toBe(false);
    }
  });

  it('rejects a credential presented after its sid tombstone; an existing tombstone is success', async () => {
    const world = createWorld();
    const { issuer } = createIssuer('handoff_code', () => world.now);
    const credential = { id: 'c', sid: 'sid-1' };
    expect(await issuer.mint('sid-1', world.now, credential)).toBe('minted');
    expect(await issuer.validate(credential)).toBe(true);
    expect(await issuer.revokeForSession('sid-1')).toBe('ok');
    expect(await issuer.revokeForSession('sid-1')).toBe('ok');
    expect(await issuer.validate(credential)).toBe(false);
    expect(
      await issuer.mint('sid-1', world.now, { id: 'later', sid: 'sid-1' })
    ).toBe('refused');
  });

  it('a credential minted for a newer session survives the older session’s revoke', async () => {
    const world = createWorld();
    const p = ports(world);
    const first = await signedIn(world);
    const old = { id: 'old', sid: first.sid };
    expect(await p.ai.issuer.mint(first.sid, world.now, old)).toBe('minted');
    await world.commit(logout(world, first.sid));
    const second = await signedIn(world);
    const fresh = { id: 'new', sid: second.sid };
    expect(await p.ai.issuer.mint(second.sid, world.now, fresh)).toBe('minted');
    world.advance(DRAIN_DELAYS_MS[0] as number);
    await p.drain();
    expect(await p.ai.issuer.validate(old)).toBe(false);
    expect(await p.ai.issuer.validate(fresh)).toBe(true);
  });

  it('a mint authorized before a credential change and committed after its revoke leaves nothing live', async () => {
    const world = createWorld();
    const p = ports(world);
    const { sid } = await signedIn(world);
    const minted = { id: 'before', sid };
    expect(await p.ai.issuer.mint(sid, world.now, minted)).toBe('minted');
    const authorizedBefore = world.now;
    world.advance(1_000);
    const grantId = await world.grant('account.password');
    world.epochs[USER_A] = 1;
    const changed = await world.fenced<'record_factors'>({
      kind: 'record_factors',
      route: 'stepup.account.password',
      grantId,
      params: { passwordChangeId: 'pwchange-1' },
      credentialChange: { newEpoch: 1 },
      epoch: world.epoch(USER_A),
      factors: null,
    });
    expect(reasonOf(changed)).toBe('ok');
    const key = `${sid}:change:${world.now}`;
    expect(world.state().outbox[key]?.effects).toEqual({
      upstream: 'acked',
      cookie: 'acked',
      credentials: { ai_token: 'pending', handoff_code: 'pending' },
    });
    world.advance(DRAIN_DELAYS_MS[0] as number);
    await p.drain();
    // The change row prunes once no credentials effect is pending; the session stays live.
    expect(world.state().outbox[key]).toBeUndefined();
    expect(world.state().sessions[sid]?.revokedAt).toBeNull();
    expect(p.ai.tombstones.has(sid)).toBe(false);
    expect(await p.ai.issuer.validate(minted)).toBe(false);
    expect(
      await p.ai.issuer.mint(sid, authorizedBefore + 500, { id: 'late', sid })
    ).toBe('refused');
    expect(await p.ai.issuer.mint(sid, world.now, { id: 'after', sid })).toBe(
      'minted'
    );
    expect(await p.ai.issuer.validate({ id: 'after', sid })).toBe(true);
  });

  it('holds the locked predicate: tombstone, watermark and the -30 s / +5 s window', () => {
    const base = {
      tombstone: false,
      watermark: null,
      resolvedAtMs: 1_000_000,
      issuerNowMs: 1_000_000,
    };
    expect(mintAllowed(base)).toBe(true);
    expect(mintAllowed({ ...base, tombstone: true })).toBe(false);
    expect(mintAllowed({ ...base, watermark: 1_000_001 })).toBe(false);
    expect(mintAllowed({ ...base, watermark: 1_000_000 })).toBe(true);
    expect(mintAllowed({ ...base, issuerNowMs: 1_030_000 })).toBe(true);
    expect(mintAllowed({ ...base, issuerNowMs: 1_030_001 })).toBe(false);
    expect(mintAllowed({ ...base, issuerNowMs: 995_000 })).toBe(true);
    expect(mintAllowed({ ...base, issuerNowMs: 994_999 })).toBe(false);
    expect(mintAllowed({ ...base, resolvedAtMs: Number.NaN })).toBe(false);
    expect(tombstoneLifetimeMs(60_000)).toBe(MIN_TOMBSTONE_LIFETIME_MS);
    expect(tombstoneLifetimeMs(600_000)).toBe(630_000);
    expect(watermarkLifetimeMs(600_000)).toBe(630_000);
  });

  it('mints only through a declared mint route with the current secret; the grace secret cannot', async () => {
    const world = createWorld();
    const { sid, secret } = await signedIn(world);
    expect(await authority(world, secret)).toEqual({
      ok: true,
      sid,
      resolvedAtMs: world.now,
    });
    expect((await authority(world, secret, 'app.write')).ok).toBe(false);
    const rotated = await world.fenced<'rotate'>({
      kind: 'rotate',
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(rotated)).toBe('ok');
    expect(await authority(world, secret)).toEqual({
      ok: false,
      reason: 'rotated',
    });
    expect((await authority(world, world.secretOf(rotated))).ok).toBe(true);
    await world.commit(logout(world, sid));
    expect(await authority(world, world.secretOf(rotated))).toEqual({
      ok: false,
      reason: 'signed_out',
    });
  });
});
