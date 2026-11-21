import { describe, expect, it } from 'vitest';
import {
  createTestIssuer,
  defaultTestClaims,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type TestIssuer,
} from './testing';
import { AUTH_METHODS, principalFromAssertion } from './principal';
import { type VerifyOptions, verifyIdentityAssertion } from './verify';

const NOW = 1_800_000_000;

function options(
  issuer: TestIssuer,
  overrides: Partial<VerifyOptions> = {}
): VerifyOptions {
  return {
    issuer: TEST_ISSUER,
    environment: 'local',
    audience: TEST_AUDIENCE,
    keys: issuer.keys,
    now: () => NOW,
    ...overrides,
  };
}

async function rawReason(headerJson: string, claimsJson: string) {
  const issuer = await createTestIssuer();
  const token = await issuer.signRaw(
    headerJson.replaceAll('$KID', issuer.kid),
    claimsJson
  );
  const result = await verifyIdentityAssertion(token, options(issuer));
  return result.ok ? 'ok' : result.reason;
}

const header = '{"alg":"ES256","typ":"ttr+identity","kid":"$KID"}';
const claimsJson = (patch = '') => {
  const base = JSON.stringify(defaultTestClaims(NOW));
  return patch ? `${base.slice(0, -1)},${patch}}` : base;
};

describe('closed member policy', () => {
  it('rejects a __proto__ member in the header instead of inheriting from it', async () => {
    expect(
      await rawReason(
        '{"alg":"ES256","typ":"ttr+identity","__proto__":{"kid":"$KID"}}',
        claimsJson()
      )
    ).toBe('header');
  });

  it('rejects a __proto__ member in the claims, and never satisfies a required claim through it', async () => {
    expect(await rawReason(header, claimsJson('"__proto__":{}'))).toBe(
      'claims'
    );
    const { jti, ...rest } = defaultTestClaims(NOW);
    const smuggled = `${JSON.stringify(rest).slice(0, -1)},"__proto__":{"jti":${JSON.stringify(jti)}}}`;
    expect(await rawReason(header, smuggled)).toBe('claims');
  });

  it('rejects a duplicate written with an escaped name', async () => {
    expect(await rawReason(header, claimsJson('"\\u0067en":9'))).toBe(
      'malformed'
    );
  });
});

describe('numeric and identifier spellings', () => {
  it.each([
    ['exponent', '"gen":3e0'],
    ['fraction', '"gen":3.0'],
    ['negative zero', '"gen":-0'],
    ['huge', '"gen":99999999999999999999'],
  ])('rejects a %s number anywhere in the claims', async (_label, patch) => {
    const claims = JSON.stringify({
      ...defaultTestClaims(NOW),
      gen: undefined,
    }).slice(0, -1);
    expect(await rawReason(header, `${claims},${patch}}`)).toBe('malformed');
  });

  it('rejects a 22-character sid or jti with non-zero padding bits', async () => {
    const issuer = await createTestIssuer();
    for (const field of ['sid', 'jti']) {
      const token = await issuer.sign({
        ...defaultTestClaims(NOW),
        [field]: 'AAAAAAAAAAAAAAAAAAAAAB',
      });
      expect(await verifyIdentityAssertion(token, options(issuer))).toEqual({
        ok: false,
        reason: 'claims',
      });
    }
  });
});

describe('ipp prefixes', () => {
  it.each(['203.0.113.0/24', '2001:db8::/48', '2001:db8:1::/48', '::/48'])(
    'accepts %s',
    async (ipp) => {
      const issuer = await createTestIssuer();
      const token = await issuer.sign({ ...defaultTestClaims(NOW), ipp });
      expect((await verifyIdentityAssertion(token, options(issuer))).ok).toBe(
        true
      );
    }
  );

  it.each([
    '2001:0db8::/48',
    '2001:DB8::/48',
    '2001:db8:0:1::/48',
    '2001:db8:0::/48',
    '2001:db8::1/48',
    '256.0.0.0/24',
    '203.0.113.1/24',
    '2001:db8::/64',
  ])('rejects %s', async (ipp) => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign({ ...defaultTestClaims(NOW), ipp });
    expect(await verifyIdentityAssertion(token, options(issuer))).toEqual({
      ok: false,
      reason: 'claims',
    });
  });
});

describe('result and key source', () => {
  it('returns a frozen assertion', async () => {
    const issuer = await createTestIssuer();
    const result = await verifyIdentityAssertion(
      await issuer.sign(defaultTestClaims(NOW)),
      options(issuer)
    );
    if (!result.ok) throw new Error(result.reason);
    expect(Object.isFrozen(result.assertion)).toBe(true);
    expect(Object.isFrozen(result.assertion.amr)).toBe(true);
  });

  it('maps a malformed key source result to keys_unavailable', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    for (const bad of [undefined, 'yes', 42]) {
      const keys = { get: async () => bad } as unknown as VerifyOptions['keys'];
      expect(
        await verifyIdentityAssertion(token, options(issuer, { keys }))
      ).toEqual({
        ok: false,
        reason: 'keys_unavailable',
      });
    }
  });
});

describe('assertion provenance', () => {
  it('converts only the verifier-returned object into a principal', async () => {
    const issuer = await createTestIssuer();
    const result = await verifyIdentityAssertion(
      await issuer.sign(defaultTestClaims(NOW)),
      options(issuer)
    );
    if (!result.ok) throw new Error(result.reason);
    expect(principalFromAssertion(result.assertion)).toMatchObject({
      kind: 'user',
      expiresAt: NOW + 60,
    });
    const copy = { ...result.assertion, aal: 'aal2' as const, generation: 99 };
    expect(() => principalFromAssertion(copy)).toThrow(TypeError);
  });

  it('rejects a key result with a type but no algorithm', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    const keys = {
      get: async () => ({ type: 'public', usages: ['verify'] }),
    } as unknown as VerifyOptions['keys'];
    expect(
      await verifyIdentityAssertion(token, options(issuer, { keys }))
    ).toEqual({ ok: false, reason: 'key_type' });
  });

  it('freezes the authentication-method allowlist', () => {
    expect(Object.isFrozen(AUTH_METHODS)).toBe(true);
    expect(() => (AUTH_METHODS as string[]).push('magic')).toThrow(TypeError);
  });
});

describe('hostile key objects', () => {
  it.each([
    ['an empty object', {}],
    ['a type without algorithm', { type: 'public', usages: ['verify'] }],
    [
      'a throwing accessor',
      Object.defineProperty({}, 'type', {
        get() {
          throw new Error('boom');
        },
      }),
    ],
  ])('rejects %s as key_type without throwing', async (_label, key) => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    const keys = { get: async () => key } as unknown as VerifyOptions['keys'];
    await expect(
      verifyIdentityAssertion(token, options(issuer, { keys }))
    ).resolves.toEqual({
      ok: false,
      reason: 'key_type',
    });
  });
});

it('rejects a plain object that mimics an ECDSA public key', async () => {
  const issuer = await createTestIssuer();
  const token = await issuer.sign(defaultTestClaims(NOW));
  const fake = {
    type: 'public',
    algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
    usages: ['verify'],
  };
  const keys = { get: async () => fake } as unknown as VerifyOptions['keys'];
  expect(
    await verifyIdentityAssertion(token, options(issuer, { keys }))
  ).toEqual({ ok: false, reason: 'key_type' });
});

it('exposes no way to enroll an object as a verifier result', async () => {
  const verify = await import('./verify');
  expect(Object.keys(verify).sort()).toEqual(
    [
      'FUTURE_IAT_TOLERANCE_SECONDS',
      'IDENTITY_ASSERTION_TYPE',
      'MAX_ASSERTION_BYTES',
      'isIssuedAssertion',
      'verifyIdentityAssertion',
    ].sort()
  );
  expect(verify.isIssuedAssertion({})).toBe(false);
});
