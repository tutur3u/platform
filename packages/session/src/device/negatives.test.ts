import { describe, expect, it } from 'vitest';
import {
  ACT_PARAMS,
  createWorld,
  epochRead,
  factorRead,
  fenceOf,
  outcomeFor,
  reasonOf,
  stepUpRouteFor,
  USER_A,
  USER_B,
  type World,
} from '../__tests__/device-fixtures';
import {
  createRouteRegistry,
  type DeviceMutation,
  type EpochRead,
  type Fence,
  GRANT_ACTS,
  type GrantAct,
  type RouteDeclaration,
  UNKNOWN_ROUTE,
} from '../device';

type Ready = { world: World; grantId: string; saved: string };

/**
 * USER_A active with one unspent grant for `act`, and USER_B as a saved
 * account. Each grant bumps the generation, so only the latest is spendable.
 */
async function readyFor(
  seed: number,
  act: GrantAct = 'api_keys.create'
): Promise<Ready> {
  const world = createWorld(seed);
  await world.signIn(USER_B);
  const saved = world.state().activeSid as string;
  await world.signIn(USER_A);
  const grantId = await world.grant(act);
  return { world, grantId, saved };
}

type Builder = (ready: Ready, fence: Fence, epoch: EpochRead) => DeviceMutation;

const base = (world: World) => ({
  operationId: world.nextOp(),
  nowMs: world.now,
});

/** Every fenced mutation, built valid against `ready` apart from what a case changes. */
const FENCED: Record<string, Builder> = {
  switch: ({ world, saved }, fence) => ({
    ...base(world),
    kind: 'switch',
    fence,
    targetSessionId: saved,
    epoch: world.epoch(USER_B),
  }),
  rotate: ({ world }, fence, epoch) => ({
    ...base(world),
    kind: 'rotate',
    fence,
    epoch,
  }),
  grant_step_up: ({ world }, fence, epoch) => ({
    ...base(world),
    kind: 'grant_step_up',
    fence,
    route: stepUpRouteFor('qr.approve'),
    params: ACT_PARAMS['qr.approve'],
    epoch,
  }),
  consume_step_up: ({ world, grantId }, fence, epoch) => ({
    ...base(world),
    kind: 'consume_step_up',
    fence,
    route: stepUpRouteFor('api_keys.create'),
    grantId,
    params: ACT_PARAMS['api_keys.create'],
    epoch,
  }),
  record_factors: ({ world, grantId }, fence, epoch) => ({
    ...base(world),
    kind: 'record_factors',
    fence,
    route: stepUpRouteFor('account.passkey.enroll'),
    grantId,
    params: ACT_PARAMS['account.passkey.enroll'],
    credentialChange: null,
    epoch,
    factors: null,
  }),
};

const KINDS = Object.keys(FENCED);
const forTarget = (kind: string) => (kind === 'switch' ? USER_B : USER_A);

describe.each(KINDS)('%s negatives', (kind) => {
  const build = FENCED[kind] as Builder;
  const ready = (seed: number) =>
    readyFor(
      seed,
      kind === 'record_factors' ? 'account.passkey.enroll' : 'api_keys.create'
    );

  it('returns superseded for a wrong fence in any member', async () => {
    for (const patch of [
      { gen: -1 },
      { version: -1 },
      { sessionId: 'other' },
    ]) {
      const r = await ready(1);
      const fence = { ...fenceOf(r.world.state()), ...patch };
      const out = await r.world.commit(build(r, fence, r.world.epoch(USER_A)));
      expect(reasonOf(out)).toBe('superseded');
      expect(out.effects).toEqual([]);
    }
  });

  it('refuses a null fence', async () => {
    const r = await ready(2);
    const mutation = {
      ...build(r, fenceOf(r.world.state()), r.world.epoch(USER_A)),
      fence: null,
    };
    expect(reasonOf(await r.world.commit(mutation as DeviceMutation))).toBe(
      'invalid_operation'
    );
  });

  it('fails closed on a stale or unavailable epoch, and refuses another user’s read', async () => {
    for (const [status, reason] of [
      ['stale', 'epoch_unavailable'],
      ['unavailable', 'epoch_unavailable'],
    ] as const) {
      const r = await ready(3);
      const mutation = build(
        r,
        fenceOf(r.world.state()),
        r.world.epoch(USER_A, status)
      );
      const read = { ...r.world.epoch(forTarget(kind), status) };
      const out = await r.world.commit({
        ...mutation,
        epoch: read,
      } as DeviceMutation);
      expect(reasonOf(out)).toBe(reason);
    }
    const r = await ready(4);
    const mutation = build(r, fenceOf(r.world.state()), r.world.epoch(USER_A));
    const foreign = epochRead(
      forTarget(kind) === USER_A ? USER_B : USER_A,
      0,
      r.world.now
    );
    expect(
      reasonOf(
        await r.world.commit({ ...mutation, epoch: foreign } as DeviceMutation)
      )
    ).toBe('invalid_operation');
  });

  it('returns idempotency_mismatch for a reused operation id with another body', async () => {
    const r = await ready(5);
    const first = build(r, fenceOf(r.world.state()), r.world.epoch(USER_A));
    expect(reasonOf(await r.world.commit(first))).toBe('ok');
    const reused = {
      ...first,
      nowMs: r.world.now + 1,
      fence: { ...(first as { fence: Fence }).fence, gen: 99 },
    };
    expect(reasonOf(await r.world.commit(reused as DeviceMutation))).toBe(
      'idempotency_mismatch'
    );
  });
});

describe('other negatives', () => {
  it('refuses a null-fenced sign-in once the device holds state', async () => {
    const r = await readyFor(6);
    const out = await r.world.commit({
      kind: 'sign_in',
      ...base(r.world),
      fence: null,
      outcome: outcomeFor(USER_A),
      reservation: { reservationId: 'slot-late' },
      eviction: null,
      capturedEpoch: 0,
      epoch: r.world.epoch(USER_A),
      factors: factorRead(USER_A, r.world.now),
    });
    expect(reasonOf(out)).toBe('superseded');
  });

  it('refuses a grant spent on a route with another act, even with equal parameters', async () => {
    const r = await readyFor(7);
    const out = await r.world.fenced<'consume_step_up'>({
      kind: 'consume_step_up',
      route: stepUpRouteFor('api_keys.rotate'),
      grantId: r.grantId,
      params: { workspaceId: 'ws-1', keyId: 'key-1' },
      epoch: r.world.epoch(USER_A),
    });
    expect(reasonOf(out)).toBe('grant_invalid');
  });

  it('refuses record_factors with no grant, and redeem_child with a stale epoch', async () => {
    const r = await readyFor(8);
    const recorded = await r.world.fenced<'record_factors'>({
      kind: 'record_factors',
      route: stepUpRouteFor('account.passkey.enroll'),
      grantId: 'missing',
      params: ACT_PARAMS['account.passkey.enroll'],
      credentialChange: null,
      epoch: r.world.epoch(USER_A),
      factors: null,
    });
    expect(reasonOf(recorded)).toBe('grant_invalid');
    const state = r.world.state();
    const redeemed = await r.world.commit({
      kind: 'redeem_child',
      ...base(r.world),
      codeParent: { sid: state.activeSid as string, gen: state.gen, epoch: 0 },
      child: { host: 'h.example.test', callback: '/', kind: 'child' },
      epoch: r.world.epoch(USER_A, 'stale'),
    });
    expect(reasonOf(redeemed)).toBe('epoch_unavailable');
  });
});

describe('route registry', () => {
  const stepUp = (act: GrantAct, extra: Partial<RouteDeclaration> = {}) =>
    ({
      class: 'security',
      accountScoped: true,
      stepUp: { act, tenantParams: Object.keys(GRANT_ACTS[act].params) },
      ...extra,
    }) as RouteDeclaration;

  it('treats an unknown route as account-scoped security with no step-up', () => {
    const registry = createRouteRegistry({
      'a.read': { class: 'read', accountScoped: false },
    });
    expect(registry.get('nowhere')).toEqual(UNKNOWN_ROUTE);
    expect(registry.has('nowhere')).toBe(false);
    expect(UNKNOWN_ROUTE).toEqual({ class: 'security', accountScoped: true });
  });

  it('rejects declarations outside the design at build time', () => {
    const bad: RouteDeclaration[] = [
      stepUp('api_keys.create', { class: 'read' } as Partial<RouteDeclaration>),
      stepUp('api_keys.create', {
        accountScoped: false,
      } as Partial<RouteDeclaration>),
      {
        ...stepUp('api_keys.create'),
        stepUp: { act: 'not.an.act' as GrantAct, tenantParams: [] },
      },
      {
        ...stepUp('api_keys.create'),
        stepUp: {
          act: 'api_keys.create',
          tenantParams: ['workspaceId', 'keyName'],
        },
      },
      {
        class: 'write',
        accountScoped: true,
        method: 'GET',
      } as unknown as RouteDeclaration,
    ];
    for (const declaration of bad) {
      expect(() => createRouteRegistry({ 'r.bad': declaration })).toThrow(
        TypeError
      );
    }
    expect(() =>
      createRouteRegistry({
        'auth.ai_token.mint': { class: 'write', accountScoped: true },
      })
    ).toThrow(/mint route/);
    expect(() =>
      createRouteRegistry({
        'auth.handoff.mint': stepUp('api_keys.create', {
          class: 'credential',
        } as Partial<RouteDeclaration>),
      })
    ).toThrow(/mint route/);
  });

  it('accepts every act with its required parameters as tenant fields', () => {
    const declarations = Object.fromEntries(
      (Object.keys(GRANT_ACTS) as GrantAct[]).map((act) => [
        `r.${act}`,
        stepUp(act),
      ])
    );
    const registry = createRouteRegistry(declarations);
    expect(Object.isFrozen(registry.get('r.cli.approve'))).toBe(true);
  });
});
