import { describe, expect, it } from 'vitest';
import {
  ACT,
  createStepUpWorld,
  JTI,
  NONCE,
  OTHER_USER,
  type StepUpWorld,
  USER,
} from '../__tests__/stepup-fixtures';
import { mintClaims, NOW } from '../__tests__/token-fixtures';
import { encodeBase64Url } from '../encoding';
import { type StepUpVerifyOptions, verifyStepUpProof } from '../stepup';
import { mintToken, TOKEN_CLASSES, verifyToken } from '../tokens';
import { verifyIdentityAssertion } from '../verify';

const bytes = (length: number, fill = 5) =>
  encodeBase64Url(new Uint8Array(length).fill(fill));

async function reason(
  world: StepUpWorld,
  patch: Record<string, unknown>,
  overrides: Partial<StepUpVerifyOptions> = {}
) {
  const token = await world.sign(world.claims(patch));
  const result = await verifyStepUpProof(token, world.options(overrides));
  return result.ok ? 'ok' : result.reason;
}

describe('a valid step-up proof', () => {
  it('verifies a minted proof into a frozen record', async () => {
    const world = await createStepUpWorld(['stepup']);
    const minted = await mintToken(
      'stepup',
      { ...mintClaims('stepup'), ph: world.ph, nonce: NONCE },
      world.mintOptions()
    );
    if (!minted.ok) throw new Error(minted.reason);
    const result = await verifyStepUpProof(minted.token, world.options());
    if (!result.ok) throw new Error(result.reason);
    expect(result).toMatchObject({
      audience: 'stepup:vault',
      subject: USER,
      sessionId: 'AAAAAAAAAAAAAAAAAAAAAA',
      generation: 3,
      act: ACT,
      nonce: NONCE,
      expiresAt: NOW + 300,
      amr: ['totp'],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.amr)).toBe(true);
  });

  it.each([
    [['totp'], ['totp']],
    [['passkey'], ['passkey', 'pwd']],
    [
      ['totp', 'passkey'],
      ['passkey', 'totp'],
    ],
  ])('accepts amr %j when allowedAmr is %j', async (amr, allowedAmr) => {
    const world = await createStepUpWorld(['stepup']);
    expect(await reason(world, { amr }, { allowedAmr })).toBe('ok');
  });

  it('accepts 16- and 32-byte nonces and auth_time at the window edges', async () => {
    const world = await createStepUpWorld(['stepup']);
    expect(await reason(world, { nonce: bytes(16) })).toBe('ok');
    expect(await reason(world, { nonce: bytes(32) })).toBe('ok');
    expect(await reason(world, { auth_time: NOW })).toBe('ok');
    expect(await reason(world, { auth_time: NOW - 300 })).toBe('ok');
  });

  it('accepts a 300-second proof and rejects a 301-second one', async () => {
    const world = await createStepUpWorld(['stepup']);
    expect(await reason(world, { exp: NOW + 300 })).toBe('ok');
    expect(await reason(world, { exp: NOW + 301 })).toBe('time');
  });
});

describe('member violations', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['iss', { iss: 'https://evil.test' }, 'issuer'],
    ['env', { env: 'production' }, 'environment'],
    ['aud', { aud: 'stepup:other' }, 'audience'],
    ['sub of another user', { sub: OTHER_USER }, 'subject_mismatch'],
    ['a malformed sub', { sub: 'not-a-uuid' }, 'claims'],
    ['a missing sid', { sid: undefined }, 'claims'],
    ['a malformed sid', { sid: 'AAAA' }, 'claims'],
    ['a negative gen', { gen: -1 }, 'claims'],
    ['an unregistered act', { act: 'vault.other' }, 'claims'],
    ['ph of the wrong value', { ph: bytes(32, 8) }, 'params_mismatch'],
    ['ph of 31 bytes', { ph: bytes(31) }, 'claims'],
    ['ph of 33 bytes', { ph: bytes(33) }, 'claims'],
    ['padded ph', { ph: `${bytes(32)}=` }, 'claims'],
    ['a 15-byte nonce', { nonce: bytes(15) }, 'claims'],
    ['a 33-byte nonce', { nonce: bytes(33) }, 'claims'],
    ['a non-canonical nonce', { nonce: 'CQkJCQkJCQkJCQkJCQkJCR' }, 'claims'],
    ['aal1', { aal: 'aal1' }, 'claims'],
    ['pwd in amr', { amr: ['pwd'] }, 'claims'],
    ['pwd beside a step-up factor', { amr: ['totp', 'pwd'] }, 'claims'],
    ['an empty amr', { amr: [] }, 'claims'],
    ['a duplicate amr', { amr: ['totp', 'totp'] }, 'claims'],
    ['an amr string', { amr: 'totp' }, 'claims'],
    ['auth_time after iat', { auth_time: NOW + 1 }, 'time'],
    ['auth_time 301 s before iat', { auth_time: NOW - 301 }, 'time'],
    ['a future iat', { iat: NOW + 6, exp: NOW + 300 }, 'time'],
    [
      'an expired proof',
      { iat: NOW - 300, exp: NOW, auth_time: NOW - 300 },
      'time',
    ],
    ['a missing jti', { jti: undefined }, 'claims'],
    ['a malformed jti', { jti: 'short' }, 'claims'],
    ['an extra member', { scope: 'all' }, 'claims'],
    ['a missing nonce', { nonce: undefined }, 'claims'],
    ['a missing ph', { ph: undefined }, 'claims'],
  ])('rejects %s', async (_name, patch, expected) => {
    const world = await createStepUpWorld(['stepup']);
    expect(await reason(world, patch)).toBe(expected);
  });

  it('rejects a factor the service does not allow', async () => {
    const world = await createStepUpWorld(['stepup']);
    expect(
      await reason(world, { amr: ['totp'] }, { allowedAmr: ['passkey'] })
    ).toBe('amr_not_allowed');
    expect(
      await reason(
        world,
        { amr: ['totp', 'passkey'] },
        { allowedAmr: ['totp'] }
      )
    ).toBe('amr_not_allowed');
  });

  it('rejects a proof bound to other parameters', async () => {
    const world = await createStepUpWorld(['stepup']);
    const other = new Uint8Array(world.hash);
    other[31] = (other[31] ?? 0) ^ 1;
    expect(await reason(world, {}, { expectedParamsHash: other })).toBe(
      'params_mismatch'
    );
  });
});

describe('verifier options', () => {
  it.each<[string, Partial<StepUpVerifyOptions>]>([
    ['a 31-byte expected hash', { expectedParamsHash: new Uint8Array(31) }],
    ['an expected hash string', { expectedParamsHash: 'x' as never }],
    ['an unregistered act', { act: 'vault.other' as never }],
    ['a malformed subject', { subject: 'user' as never }],
    ['an empty allowedAmr', { allowedAmr: [] }],
    ['an allowedAmr of first factors only', { allowedAmr: ['pwd'] }],
    ['an allowedAmr string', { allowedAmr: 'totp' as never }],
    ['an identity audience', { audience: 'mount:tasks' as never }],
  ])('fail closed with %s', async (_name, overrides) => {
    const world = await createStepUpWorld(['stepup']);
    const expected = overrides.audience ? 'audience' : 'options';
    expect(await reason(world, {}, overrides)).toBe(expected);
  });
});

describe('cross-class rejection', () => {
  const OTHERS = TOKEN_CLASSES.filter((tokenClass) => tokenClass !== 'stepup');

  it.each(OTHERS)(
    'a minted %s token is not a step-up proof',
    async (minted) => {
      const world = await createStepUpWorld();
      const result = await mintToken(
        minted,
        mintClaims(minted),
        world.mintOptions()
      );
      if (!result.ok) throw new Error(result.reason);
      expect(await verifyStepUpProof(result.token, world.options())).toEqual({
        ok: false,
        reason: 'type',
      });
    }
  );

  it.each(OTHERS)('a %s key cannot sign a step-up proof', async (keyClass) => {
    const world = await createStepUpWorld();
    const token = await world.sign(world.claims(), keyClass, 'stepup');
    expect(await verifyStepUpProof(token, world.options())).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
  });

  it.each(OTHERS)('a step-up proof is not a %s token', async (tokenClass) => {
    const world = await createStepUpWorld();
    const token = await world.sign(world.claims());
    const result = await verifyToken(
      tokenClass,
      token,
      world.verifyOptions(tokenClass)
    );
    expect(result).toEqual({ ok: false, reason: 'type' });
  });

  it('a step-up proof is not an identity assertion', async () => {
    const world = await createStepUpWorld();
    const token = await world.sign(world.claims());
    const identity = world.verifyOptions('identity');
    expect(
      await verifyIdentityAssertion(token, {
        issuer: identity.issuer,
        environment: identity.environment,
        audience: identity.audience,
        keys: identity.keys,
        now: identity.now,
      })
    ).toEqual({ ok: false, reason: 'type' });
  });

  it('keeps the jti of the proof it verified', async () => {
    const world = await createStepUpWorld(['stepup']);
    const result = await verifyStepUpProof(
      await world.sign(world.claims()),
      world.options()
    );
    expect(result.ok && result.jti).toBe(JTI);
  });
});
