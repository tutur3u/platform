import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decideLogin,
  type IssuanceDependencies,
  type LoginTransaction,
} from '../issuance/service';
import { type Fixture, fixture, serviceProvider } from './fixture';
import { actor, policy } from './issuance-fixture';

let f: Fixture;
beforeAll(() => {
  f = fixture();
});
function setup() {
  let consumed = false;
  let consent: boolean | undefined;
  let finalized = false;
  const tx: LoginTransaction = {
    id: crypto.randomUUID(),
    handle: 'handle',
    browserHash: 'browser',
    expiresAt: new Date(f.now.getTime() + 290_000).toISOString(),
    request: f.request,
    policy,
  };
  const principal = {
    ...actor,
    primaryAt: Math.floor(f.now.getTime() / 1000),
    mfaAt: Math.floor(f.now.getTime() / 1000),
  };
  const current = () =>
    Promise.resolve({ policy, principal, profile: f.profile, idp: f.idp });
  const d: IssuanceDependencies = {
    enabled: () => true,
    now: () => f.now,
    generateId: () => `_${crypto.randomUUID()}`,
    current: vi.fn(current),
    prepareSigner: vi.fn(async () => f.signer),
    consent: vi.fn(async (approved) => {
      if (consumed || consent !== undefined) throw Error('replay');
      consent = approved;
      if (!approved) consumed = true;
    }),
    consume: vi.fn(async () => {
      if (consumed || consent !== true) throw Error('replay');
      consumed = true;
      return 'ab'.repeat(32);
    }),
    finalize: vi.fn(async () => {
      if (!consumed || finalized) throw Error('replay');
      finalized = true;
    }),
    failed: vi.fn(async () => {
      consumed = true;
    }),
  };
  return { tx, d, current, principal };
}
describe('one-use issuance orchestration', () => {
  it('issues phase-2 hex pairwise subjects accepted by the real Node-SAML SP', async () => {
    const { tx, d } = setup();
    const result = await decideLogin(tx, true, d);
    expect(result.kind).toBe('issued');
    if (result.kind !== 'issued') throw Error('expected issuance');
    const accepted = await (await serviceProvider(f)).accept(
      result.response.xml
    );
    expect(accepted.nameID).toBe('ab'.repeat(32));
    expect(accepted.attributes).toEqual({
      id: 'ab'.repeat(32),
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
    });
    expect(d.finalize).toHaveBeenCalledTimes(1);
  });
  it('denial records consent and never signs or consumes an assertion', async () => {
    const { tx, d } = setup();
    expect(await decideLogin(tx, false, d)).toEqual({ kind: 'denied' });
    expect(d.consent).toHaveBeenCalledWith(false, expect.anything());
    expect(d.consume).not.toHaveBeenCalled();
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it('rejects replay of an approved transaction', async () => {
    const { tx, d } = setup();
    await decideLogin(tx, true, d);
    await expect(decideLogin(tx, true, d)).rejects.toThrow();
    expect(d.finalize).toHaveBeenCalledTimes(1);
  });
  it('only one concurrent decision can consume', async () => {
    const { tx, d } = setup();
    const results = await Promise.allSettled([
      decideLogin(tx, true, d),
      decideLogin(tx, true, d),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(d.finalize).toHaveBeenCalledTimes(1);
  });
  it.each([
    'disabled',
    'expired',
    'missing key',
    'audit unavailable',
    'consume unknown',
    'signer fails',
  ])('fails closed: %s', async (kind) => {
    const { tx, d } = setup();
    if (kind === 'disabled') d.enabled = () => false;
    if (kind === 'expired') tx.expiresAt = f.now.toISOString();
    if (kind === 'missing key')
      d.prepareSigner = async () => {
        throw Error('missing');
      };
    if (kind === 'audit unavailable')
      d.finalize = async () => {
        throw Error('unavailable');
      };
    if (kind === 'consume unknown')
      d.consume = async () => {
        throw Error('unknown');
      };
    if (kind === 'signer fails')
      d.prepareSigner = async () => () => {
        throw Error('sign failed');
      };
    await expect(decideLogin(tx, true, d)).rejects.toThrow();
    expect(d.failed).toHaveBeenCalledTimes(1);
  });
  it.each([
    'member removed',
    'assignment removed',
    'key changed',
    'policy changed',
    'account switched',
    'recovery',
    'email changed',
  ])('rechecks after signing: %s', async (kind) => {
    const { tx, d, current } = setup();
    const final = await current();
    const second = {
      ...final,
      policy: { ...final.policy },
      principal: { ...final.principal },
    };
    if (kind === 'member removed') second.policy.member = false;
    if (kind === 'assignment removed') second.policy.assigned = false;
    if (kind === 'key changed') second.policy.keyRevision++;
    if (kind === 'policy changed') second.policy.revision++;
    if (kind === 'account switched')
      second.principal.userId = crypto.randomUUID();
    if (kind === 'recovery') second.principal.accountAllowed = false;
    if (kind === 'email changed')
      second.principal.email = 'changed@example.test';
    d.current = vi
      .fn()
      .mockResolvedValueOnce(final)
      .mockResolvedValueOnce(second);
    await expect(decideLogin(tx, true, d)).rejects.toThrow();
    expect(d.finalize).not.toHaveBeenCalled();
    expect(d.failed).toHaveBeenCalledWith(true);
  });
  it('a disable during signing prevents finalization', async () => {
    const { tx, d } = setup();
    let on = true;
    d.enabled = () => on;
    d.prepareSigner = async () => (input) => {
      on = false;
      return f.signer(input);
    };
    await expect(decideLogin(tx, true, d)).rejects.toThrow();
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it.each([598, 600])(
    'rechecks %s-second-old MFA after finalization',
    async (age) => {
      const { tx, d, principal } = setup();
      let now = new Date(Math.floor(f.now.getTime() / 1000) * 1000);
      d.now = () => now;
      const started = now.getTime();
      principal.mfaAt -= age;
      principal.primaryAt = principal.mfaAt - 1;
      d.finalize = vi.fn(async () => {
        now = new Date(started + 2000);
      });
      if (age === 600) {
        await expect(decideLogin(tx, true, d)).rejects.toMatchObject({
          code: 'mfa_required',
        });
        expect(d.failed).toHaveBeenCalledWith(true);
      } else {
        expect((await decideLogin(tx, true, d)).kind).toBe('issued');
        expect(d.failed).not.toHaveBeenCalled();
      }
      expect(d.finalize).toHaveBeenCalledTimes(1);
    }
  );
  it('does not emit when finalization finishes after the five-second budget', async () => {
    const { tx, d } = setup();
    let now = f.now;
    d.now = () => now;
    d.finalize = async () => {
      now = new Date(f.now.getTime() + 5001);
    };
    await expect(decideLogin(tx, true, d)).rejects.toThrow();
    expect(d.failed).toHaveBeenCalledWith(true);
  });
});
