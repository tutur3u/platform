import { describe, expect, it } from 'vitest';
import {
  ACT_PARAMS,
  createWorld,
  factorRead,
  outcomeFor,
  reasonOf,
  SIGN_IN_PASSKEY,
  stepUpRouteFor,
  TOTP,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import type { FreshFactors, GrantAct, SessionFactor } from '../device';
import type { JsonValue } from '../encoding';

async function ready(factors: SessionFactor[] = [TOTP, SIGN_IN_PASSKEY]) {
  const world = createWorld();
  world.factors[USER_A] = factors;
  const amr = factors.some((factor) => factor.method === 'totp')
    ? ['pwd', 'totp']
    : ['pwd'];
  const out = await world.signIn(USER_A, {
    outcome: outcomeFor(USER_A, { amr: amr as ['pwd'], aal: 'aal2' }),
  });
  if (!out.result.ok) throw new Error(`sign-in failed: ${out.result.reason}`);
  return world;
}

function record(
  world: World,
  act: GrantAct,
  grantId: string,
  options: {
    params?: JsonValue;
    newEpoch?: number | null;
    factors?: FreshFactors | 'unavailable' | null;
    route?: string;
  } = {}
) {
  const newEpoch = options.newEpoch === undefined ? null : options.newEpoch;
  return world.fenced<'record_factors'>({
    kind: 'record_factors',
    route: options.route ?? stepUpRouteFor(act),
    grantId,
    params: options.params ?? ACT_PARAMS[act],
    credentialChange: newEpoch === null ? null : { newEpoch },
    epoch: world.epoch(USER_A),
    factors: options.factors ?? null,
  });
}

const activeRow = (world: World) =>
  world.state().sessions[world.state().activeSid as string];

describe('record_factors', () => {
  it('enrolls a second factor, consumes the grant and bumps gen', async () => {
    const world = await ready([]);
    const grantId = await world.grant('account.mfa.enroll');
    const gen = world.state().gen;
    const out = await record(world, 'account.mfa.enroll', grantId);
    expect(reasonOf(out)).toBe('ok');
    expect(world.state().gen).toBe(gen + 1);
    expect(activeRow(world)?.factors).toEqual([
      { factorId: 'totp-new', method: 'totp', role: 'second_factor' },
    ]);
    // The first second factor clears the flag, so a later switch back needs a fresh sign-in.
    expect(activeRow(world)?.secondFactorSatisfied).toBe(false);
    expect(world.state().grants[grantId]).toBeUndefined();
  });

  it('enrolls a sign-in passkey without touching the flag', async () => {
    const world = await ready();
    const grantId = await world.grant('account.passkey.enroll');
    expect(
      reasonOf(await record(world, 'account.passkey.enroll', grantId))
    ).toBe('ok');
    expect(activeRow(world)?.factors).toContainEqual({
      factorId: 'pk-new',
      method: 'passkey',
      role: 'sign_in',
    });
    expect(activeRow(world)?.secondFactorSatisfied).toBe(true);
  });

  it('removes exactly the listed factors, requiring each to be held, at the new epoch', async () => {
    const world = await ready();
    const missing = await world.grant('account.mfa.remove', {
      factorIds: ['nope'],
    });
    world.epochs[USER_A] = 1;
    expect(
      reasonOf(
        await record(world, 'account.mfa.remove', missing, {
          params: { factorIds: ['nope'] },
          newEpoch: 1,
        })
      )
    ).toBe('invalid_operation');
  });

  it('keeps the acting session alive across a credential change and queues the issuer revoke', async () => {
    const world = await ready();
    const grantId = await world.grant('account.mfa.remove');
    world.epochs[USER_A] = 1;
    const out = await record(world, 'account.mfa.remove', grantId, {
      newEpoch: 1,
    });
    expect(reasonOf(out)).toBe('ok');
    const row = activeRow(world);
    expect(row?.epochSeen).toBe(1);
    expect(row?.factors).toEqual([SIGN_IN_PASSKEY]);
    const key = `${row?.sid}:change:${world.now}`;
    expect(world.state().outbox[key]).toMatchObject({
      changedAt: world.now,
      upstream: null,
      effects: { upstream: 'acked', cookie: 'acked' },
    });
    expect(
      out.effects.filter((effect) => effect.type === 'revoke_credentials')
    ).toHaveLength(2);
    // The UserSessions fan-out at the new epoch spares this session.
    const fanOut = await world.commit({
      kind: 'revoke_user_below_epoch',
      operationId: 'fan-out',
      nowMs: world.now,
      userId: USER_A,
      belowEpoch: 1,
      bumpedAtMs: world.now,
    });
    expect(fanOut.result.ok && fanOut.result.revoked).toEqual([]);
    expect(row && world.state().sessions[row.sid]?.revokedAt).toBeNull();
  });

  it('requires credentialChange for credential acts only, equal to a fresh epoch above epochSeen', async () => {
    const world = await ready();
    const password = await world.grant('account.password');
    expect(reasonOf(await record(world, 'account.password', password))).toBe(
      'invalid_operation'
    );
    world.epochs[USER_A] = 1;
    expect(
      reasonOf(
        await record(world, 'account.password', password, { newEpoch: 2 })
      )
    ).toBe('invalid_operation');
    world.epochs[USER_A] = 0;
    expect(
      reasonOf(
        await record(world, 'account.password', password, { newEpoch: 0 })
      )
    ).toBe('invalid_operation');
    const enroll = await world.grant('account.passkey.enroll');
    expect(
      reasonOf(
        await record(world, 'account.passkey.enroll', enroll, { newEpoch: 1 })
      )
    ).toBe('invalid_operation');
  });

  it('refuses without a grant, with a grant for another act, and on a non-factor route', async () => {
    const world = await ready();
    const key = await world.grant('api_keys.create');
    world.epochs[USER_A] = 1;
    expect(
      reasonOf(
        await record(world, 'account.password', 'missing', { newEpoch: 1 })
      )
    ).toBe('grant_invalid');
    expect(
      reasonOf(await record(world, 'account.password', key, { newEpoch: 1 }))
    ).toBe('grant_invalid');
    world.epochs[USER_A] = 0;
    expect(
      reasonOf(
        await record(world, 'api_keys.create', key, {
          route: stepUpRouteFor('api_keys.create'),
        })
      )
    ).toBe('invalid_operation');
  });

  it('revokes the session instead when its epoch is behind and the act is no credential change', async () => {
    const world = await ready();
    const grantId = await world.grant('account.passkey.enroll');
    world.epochs[USER_A] = 1;
    expect(
      reasonOf(await record(world, 'account.passkey.enroll', grantId))
    ).toBe('signed_out');
    expect(world.state().activeSid).toBeNull();
  });
});

describe('account.mfa.reset', () => {
  it('requires a fresh read and fails on unavailable or null', async () => {
    const world = await ready();
    const grantId = await world.grant('account.mfa.reset');
    world.epochs[USER_A] = 1;
    expect(
      reasonOf(
        await record(world, 'account.mfa.reset', grantId, { newEpoch: 1 })
      )
    ).toBe('factors_unavailable');
    expect(
      reasonOf(
        await record(world, 'account.mfa.reset', grantId, {
          newEpoch: 1,
          factors: 'unavailable',
        })
      )
    ).toBe('factors_unavailable');
    const lagging = factorRead(USER_A, world.now - 5_001, [TOTP]);
    expect(
      reasonOf(
        await record(world, 'account.mfa.reset', grantId, {
          newEpoch: 1,
          factors: lagging,
        })
      )
    ).toBe('invalid_operation');
    const foreign = factorRead(USER_B, world.now, [TOTP]);
    expect(
      reasonOf(
        await record(world, 'account.mfa.reset', grantId, {
          newEpoch: 1,
          factors: foreign,
        })
      )
    ).toBe('invalid_operation');
  });

  it('fails after a new second factor is enrolled elsewhere', async () => {
    const world = await ready();
    const grantId = await world.grant('account.mfa.reset');
    world.epochs[USER_A] = 1;
    const read = factorRead(USER_A, world.now, [
      TOTP,
      { factorId: 'totp-2', method: 'totp', role: 'second_factor' },
    ]);
    expect(
      reasonOf(
        await record(world, 'account.mfa.reset', grantId, {
          newEpoch: 1,
          factors: read,
        })
      )
    ).toBe('factor_mismatch');
  });

  it('is not blocked by a factor removed elsewhere and keeps sign-in passkeys', async () => {
    const world = await ready([
      TOTP,
      { factorId: 'totp-2', method: 'totp', role: 'second_factor' },
      SIGN_IN_PASSKEY,
    ]);
    const grantId = await world.grant('account.mfa.reset', {
      factorIds: ['totp-1'],
    });
    world.epochs[USER_A] = 1;
    const read = factorRead(USER_A, world.now, [TOTP, SIGN_IN_PASSKEY]);
    const out = await record(world, 'account.mfa.reset', grantId, {
      newEpoch: 1,
      factors: read,
      params: { factorIds: ['totp-1'] },
    });
    expect(reasonOf(out)).toBe('ok');
    expect(activeRow(world)?.factors).toEqual([SIGN_IN_PASSKEY]);
  });

  it('refuses a factor read for any other act', async () => {
    const world = await ready();
    const grantId = await world.grant('account.passkey.enroll');
    const read = factorRead(USER_A, world.now, [TOTP]);
    expect(
      reasonOf(
        await record(world, 'account.passkey.enroll', grantId, {
          factors: read,
        })
      )
    ).toBe('invalid_operation');
  });
});

describe('switch', () => {
  it('needs a fresh sign-in after enrolling a first second factor, then switching back', async () => {
    const world = await ready([]);
    const a = world.state().activeSid as string;
    const grantId = await world.grant('account.mfa.enroll');
    await record(world, 'account.mfa.enroll', grantId);
    await world.signIn(USER_B);
    const out = await world.fenced<'switch'>({
      kind: 'switch',
      targetSessionId: a,
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(out)).toBe('reauth_required');
  });

  it('needs a fresh sign-in after 24 hours and invalidates the previous tab on success', async () => {
    const world = await ready([]);
    const a = world.state().activeSid as string;
    await world.signIn(USER_B);
    const b = world.state().activeSid as string;
    const ok = await world.fenced<'switch'>({
      kind: 'switch',
      targetSessionId: a,
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(ok)).toBe('ok');
    expect(ok.effects).toContainEqual({ type: 'tab_invalidate', sessionId: b });
    expect(world.state().activeSid).toBe(a);
    world.advance(24 * 60 * 60_000 + 1);
    const late = await world.fenced<'switch'>({
      kind: 'switch',
      targetSessionId: b,
      epoch: world.epoch(USER_B),
    });
    expect(reasonOf(late)).toBe('reauth_required');
  });

  it('revokes a target below the fresh epoch instead of activating it', async () => {
    const world = await ready([]);
    const a = world.state().activeSid as string;
    await world.signIn(USER_B);
    world.epochs[USER_A] = 3;
    const out = await world.fenced<'switch'>({
      kind: 'switch',
      targetSessionId: a,
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(out)).toBe('signed_out');
    expect(world.state().sessions[a]?.revokedReason).toBe('epoch');
    expect(world.state().activeSid).not.toBe(a);
  });
});
