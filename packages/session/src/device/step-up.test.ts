import { describe, expect, it } from 'vitest';
import {
  ACT_PARAMS,
  createWorld,
  epochRead,
  fenceOf,
  reasonOf,
  stepUpRouteFor,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import { paramsHash } from '../stepup';
import { GRANT_TTL_MS, type JsonValue } from '../device';
import type { JsonValue as EncodingJson } from '../encoding';

const KEY = 'api_keys.create' as const;

async function ready(seed = 1) {
  const world = createWorld(seed);
  await world.signIn(USER_A);
  return world;
}

function consume(
  world: World,
  grantId: string,
  params: EncodingJson = ACT_PARAMS[KEY],
  route = stepUpRouteFor(KEY)
) {
  return world.fenced<'consume_step_up'>({
    kind: 'consume_step_up',
    route,
    grantId,
    params,
    epoch: world.epoch(USER_A),
  });
}

describe('grant_step_up', () => {
  it('bumps gen and binds the grant to the new sid, gen, act, computed ph and a 5-minute expiry', async () => {
    const world = await ready();
    const before = world.state().gen;
    const grantId = await world.grant(KEY);
    const state = world.state();
    const grant = state.grants[grantId];
    expect(state.gen).toBe(before + 1);
    expect(state.grace).toBeNull();
    expect(grant).toMatchObject({
      sid: state.activeSid,
      gen: state.gen,
      act: KEY,
      expiresAtMs: world.now + GRANT_TTL_MS,
    });
    expect(grant?.consumedBy).toBeUndefined();
  });

  it('hashes through the shared step-up digest, so the vault act matches paramsHash', async () => {
    const world = await ready();
    const grantId = await world.grant('vault.pin-eval');
    const expected = await paramsHash(
      'vault.pin-eval',
      ACT_PARAMS['vault.pin-eval']
    );
    expect(expected.ok && world.state().grants[grantId]?.ph).toBe(
      expected.ok ? expected.ph : ''
    );
  });

  it('refuses an unknown route, a route without a step-up, and malformed parameters', async () => {
    const world = await ready();
    const grantFor = (route: string, params: JsonValue) =>
      world.fenced<'grant_step_up'>({
        kind: 'grant_step_up',
        route,
        params,
        epoch: world.epoch(USER_A),
      });
    expect(reasonOf(await grantFor('unknown.route', {}))).toBe(
      'invalid_operation'
    );
    expect(reasonOf(await grantFor('app.write', {}))).toBe('invalid_operation');
    const route = stepUpRouteFor(KEY);
    expect(
      reasonOf(await grantFor(route, { workspaceId: 'ws-1', keyName: 'ci' }))
    ).toBe('invalid_operation');
    expect(
      reasonOf(
        await grantFor(route, {
          ...(ACT_PARAMS[KEY] as object),
          extra: 'x',
        } as JsonValue)
      )
    ).toBe('invalid_operation');
    const dup = { factorIds: ['b', 'b'] };
    expect(
      reasonOf(await grantFor(stepUpRouteFor('account.mfa.remove'), dup))
    ).toBe('invalid_operation');
  });

  it('fails a wrong fence, a stale epoch and an epoch read for another user', async () => {
    const world = await ready();
    const route = stepUpRouteFor(KEY);
    const wrong = { ...fenceOf(world.state()), version: 0 };
    const superseded = await world.fenced<'grant_step_up'>({
      kind: 'grant_step_up',
      route,
      params: ACT_PARAMS[KEY],
      epoch: world.epoch(USER_A),
      fence: wrong,
    });
    expect(reasonOf(superseded)).toBe('superseded');
    const stale = await world.fenced<'grant_step_up'>({
      kind: 'grant_step_up',
      route,
      params: ACT_PARAMS[KEY],
      epoch: world.epoch(USER_A, 'stale'),
    });
    expect(reasonOf(stale)).toBe('epoch_unavailable');
    const foreign = await world.fenced<'grant_step_up'>({
      kind: 'grant_step_up',
      route,
      params: ACT_PARAMS[KEY],
      epoch: epochRead(USER_B, 0, world.now),
    });
    expect(reasonOf(foreign)).toBe('invalid_operation');
  });

  it('revokes a session below the fresh epoch instead of granting', async () => {
    const world = await ready();
    world.epochs[USER_A] = 1;
    const out = await world.fenced<'grant_step_up'>({
      kind: 'grant_step_up',
      route: stepUpRouteFor(KEY),
      params: ACT_PARAMS[KEY],
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(out)).toBe('signed_out');
    expect(Object.keys(world.state().grants)).toEqual([]);
    expect(world.state().activeSid).toBeNull();
  });
});

describe('consume_step_up', () => {
  it('consumes a grant once, with sorted fields normalized before hashing', async () => {
    const world = await ready();
    const grantId = await world.grant('oauth.consent', {
      clientId: 'c',
      scopes: ['b', 'a'],
      workspaceIds: ['w'],
    });
    // `oauth.consent` arrays keep their order, so a reordered list is other parameters.
    expect(
      reasonOf(
        await consume(
          world,
          grantId,
          { clientId: 'c', scopes: ['a', 'b'], workspaceIds: ['w'] },
          stepUpRouteFor('oauth.consent')
        )
      )
    ).toBe('grant_invalid');
    const out = await consume(
      world,
      grantId,
      { clientId: 'c', scopes: ['b', 'a'], workspaceIds: ['w'] },
      stepUpRouteFor('oauth.consent')
    );
    expect(reasonOf(out)).toBe('ok');
    expect(world.state().grants[grantId]?.consumedBy).toBeDefined();
    const again = await consume(
      world,
      grantId,
      { clientId: 'c', scopes: ['b', 'a'], workspaceIds: ['w'] },
      stepUpRouteFor('oauth.consent')
    );
    expect(reasonOf(again)).toBe('grant_invalid');
  });

  it('fails a host-echoed ph with other parameters', async () => {
    const world = await ready();
    const grantId = await world.grant(KEY);
    const out = await consume(world, grantId, {
      workspaceId: 'ws-2',
      keyName: 'ci',
      role: 'member',
    });
    expect(reasonOf(out)).toBe('grant_invalid');
  });

  it('fails a grant used on a route with another act, even with equal parameters', async () => {
    const world = await ready();
    const grantId = await world.grant('api_keys.rotate');
    const out = await consume(
      world,
      grantId,
      ACT_PARAMS['api_keys.revoke'],
      stepUpRouteFor('api_keys.revoke')
    );
    expect(reasonOf(out)).toBe('grant_invalid');
  });

  it('fails an expired grant, a missing one, and one from before a generation bump', async () => {
    const world = await ready();
    const grantId = await world.grant(KEY);
    world.advance(GRANT_TTL_MS);
    expect(reasonOf(await consume(world, grantId))).toBe('grant_expired');
    expect(reasonOf(await consume(world, 'no-such-grant'))).toBe(
      'grant_invalid'
    );
    const fresh = await world.grant(KEY);
    await world.fenced<'rotate'>({
      kind: 'rotate',
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(await consume(world, fresh))).toBe('grant_invalid');
  });

  it('refuses factor acts and unknown routes, which go through record_factors or nowhere', async () => {
    const world = await ready();
    const grantId = await world.grant('account.password');
    expect(
      reasonOf(
        await consume(
          world,
          grantId,
          ACT_PARAMS['account.password'],
          stepUpRouteFor('account.password')
        )
      )
    ).toBe('invalid_operation');
    expect(reasonOf(await consume(world, grantId, {}, 'unknown.route'))).toBe(
      'invalid_operation'
    );
  });

  it('fails a grant bound to another saved account after a switch', async () => {
    const world = await ready();
    const a = world.state().activeSid as string;
    const grantId = await world.grant(KEY);
    await world.signIn(USER_B);
    await world.fenced<'switch'>({
      kind: 'switch',
      targetSessionId: a,
      epoch: world.epoch(USER_A),
    });
    expect(reasonOf(await consume(world, grantId))).toBe('grant_invalid');
  });

  it('emits the epoch bump for a revoke-all act', async () => {
    const world = await ready();
    const grantId = await world.grant('sessions.revoke_all');
    const out = await consume(
      world,
      grantId,
      ACT_PARAMS['sessions.revoke_all'],
      stepUpRouteFor('sessions.revoke_all')
    );
    expect(out.effects).toContainEqual({
      type: 'epoch_bump',
      userId: USER_A,
      act: 'sessions.revoke_all',
    });
  });
});
