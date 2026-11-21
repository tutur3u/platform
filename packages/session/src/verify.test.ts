import { describe, expect, it } from 'vitest';
import { encodeBase64Url, utf8 } from './encoding';
import {
  createTestIssuer,
  defaultTestClaims,
  TEST_AUDIENCE,
  TEST_ISSUER,
  type TestIssuer,
} from './testing';
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

async function reasonFor(
  claims: Record<string, unknown>,
  overrides: Partial<VerifyOptions> = {},
  header?: Record<string, unknown>
) {
  const issuer = await createTestIssuer();
  const token = await issuer.sign(
    claims,
    header ?? { alg: 'ES256', typ: 'ttr+identity', kid: issuer.kid }
  );
  const result = await verifyIdentityAssertion(
    token,
    options(issuer, overrides)
  );
  return result.ok ? 'ok' : result.reason;
}

describe('verifyIdentityAssertion', () => {
  it('accepts a well-formed assertion and reports only verified claims', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign({
      ...defaultTestClaims(NOW),
      ipp: '203.0.113.0/24',
    });
    const result = await verifyIdentityAssertion(token, options(issuer));
    expect(result).toMatchObject({
      ok: true,
      assertion: {
        generation: 3,
        source: 'cookie',
        aal: 'aal2',
        ipPrefix: '203.0.113.0/24',
      },
    });
  });

  it.each([
    ['issuer', { iss: 'https://evil.test' }],
    ['environment', { env: 'production' }],
    ['audience', { aud: 'mount:finance' }],
    ['audience', { aud: [TEST_AUDIENCE] }],
    ['claims', { env: 'prod' }],
    ['claims', { sub: '0B9D7A4E-5F3C-4C1A-9E2B-7D6F8A1C2B3E' }],
    ['claims', { sid: 'short' }],
    ['claims', { jti: 12 }],
    ['claims', { gen: -1 }],
    ['claims', { gen: 2_147_483_648 }],
    ['claims', { src: 'header' }],
    ['claims', { stale: 'false' }],
    ['claims', { aal: 'aal3' }],
    ['claims', { amr: [] }],
    ['claims', { amr: ['passkey', 'passkey'] }],
    ['claims', { amr: ['magic'] }],
    ['claims', { ipp: '203.0.113.7' }],
    ['claims', { ipp: '203.0.113.0/16' }],
    ['claims', { ipp: '2001:db8:1::/64' }],
    ['claims', { extra: true }],
    ['claims', { iat: '1800000000' }],
  ])('rejects %s for %j', async (reason, patch) => {
    expect(await reasonFor({ ...defaultTestClaims(NOW), ...patch })).toBe(
      reason
    );
  });

  it('rejects a missing required claim', async () => {
    const { jti: _jti, ...claims } = defaultTestClaims(NOW);
    expect(await reasonFor(claims)).toBe('claims');
  });

  it.each([
    ['exp equal to iat', { iat: NOW, exp: NOW }],
    ['lifetime over 60 s', { iat: NOW - 1, exp: NOW + 60 }],
    ['iat beyond the 5 s future tolerance', { iat: NOW + 6, exp: NOW + 30 }],
    ['auth_time after iat', { auth_time: NOW + 1 }],
    ['now equal to exp', { iat: NOW - 30, exp: NOW }],
  ])('rejects time when %s', async (_label, patch) => {
    expect(await reasonFor({ ...defaultTestClaims(NOW), ...patch })).toBe(
      'time'
    );
  });

  it('accepts the exact skew boundaries', async () => {
    expect(
      await reasonFor({
        ...defaultTestClaims(NOW),
        iat: NOW + 5,
        exp: NOW + 65,
        auth_time: NOW,
      })
    ).toBe('ok');
    expect(
      await reasonFor({
        ...defaultTestClaims(NOW),
        iat: NOW - 59,
        exp: NOW + 1,
      })
    ).toBe('ok');
  });

  it.each([
    ['type', { alg: 'ES256', typ: 'JWT', kid: 'test-identity-1' }],
    ['type', { alg: 'ES256', typ: 'ttr+access', kid: 'test-identity-1' }],
    ['header', { alg: 'none', typ: 'ttr+identity', kid: 'test-identity-1' }],
    ['header', { alg: 'HS256', typ: 'ttr+identity', kid: 'test-identity-1' }],
    ['header', { alg: 'ES256', typ: 'ttr+identity', kid: 'bad kid' }],
    ['header', { alg: 'ES256', typ: 'ttr+identity' }],
    [
      'header',
      {
        alg: 'ES256',
        typ: 'ttr+identity',
        kid: 'test-identity-1',
        jku: 'https://evil.test',
      },
    ],
    [
      'header',
      { alg: 'ES256', typ: 'ttr+identity', kid: 'test-identity-1', jwk: {} },
    ],
    [
      'header',
      {
        alg: 'ES256',
        typ: 'ttr+identity',
        kid: 'test-identity-1',
        crit: ['exp'],
      },
    ],
    [
      'header',
      { alg: 'ES256', typ: 'ttr+identity', kid: 'test-identity-1', b64: false },
    ],
  ])('rejects %s header %j', async (reason, header) => {
    expect(await reasonFor(defaultTestClaims(NOW), {}, header)).toBe(reason);
  });

  it('rejects an unknown kid, an unavailable or throwing key source, and a wrong-class key', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    const run = (keys: VerifyOptions['keys']) =>
      verifyIdentityAssertion(token, options(issuer, { keys }));
    expect(await run({ get: async () => null })).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
    expect(await run({ get: async () => 'unavailable' })).toEqual({
      ok: false,
      reason: 'keys_unavailable',
    });
    expect(
      await run({
        get: async () => {
          throw new Error('binding down');
        },
      })
    ).toEqual({ ok: false, reason: 'keys_unavailable' });

    const hmac = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    expect(await run({ get: async () => hmac })).toEqual({
      ok: false,
      reason: 'key_type',
    });
    const p384 = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-384' },
      false,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    expect(await run({ get: async () => p384.publicKey })).toEqual({
      ok: false,
      reason: 'key_type',
    });
  });

  it('rejects a signature from another trusted-looking key', async () => {
    const signer = await createTestIssuer();
    const verifier = await createTestIssuer();
    const token = await signer.sign(defaultTestClaims(NOW));
    expect(await verifyIdentityAssertion(token, options(verifier))).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('rejects a tampered payload and a DER-length signature', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    const [header, , signature] = token.split('.');
    const forged = encodeBase64Url(
      utf8(JSON.stringify({ ...defaultTestClaims(NOW), gen: 4 }))
    );
    expect(
      await verifyIdentityAssertion(
        `${header}.${forged}.${signature}`,
        options(issuer)
      )
    ).toEqual({
      ok: false,
      reason: 'signature',
    });
    const long = encodeBase64Url(new Uint8Array(72));
    expect(
      await verifyIdentityAssertion(
        `${header}.${token.split('.')[1]}.${long}`,
        options(issuer)
      )
    ).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('rejects duplicate members in the header and in the claims', async () => {
    const issuer = await createTestIssuer();
    const claims = JSON.stringify(defaultTestClaims(NOW));
    const duplicateHeader = `{"alg":"ES256","typ":"ttr+identity","kid":"${issuer.kid}","kid":"${issuer.kid}"}`;
    const headerToken = await issuer.signRaw(duplicateHeader, claims);
    expect(await verifyIdentityAssertion(headerToken, options(issuer))).toEqual(
      { ok: false, reason: 'malformed' }
    );

    const header = JSON.stringify({
      alg: 'ES256',
      typ: 'ttr+identity',
      kid: issuer.kid,
    });
    const duplicateClaims = `${claims.slice(0, -1)},"gen":9}`;
    const claimsToken = await issuer.signRaw(header, duplicateClaims);
    expect(await verifyIdentityAssertion(claimsToken, options(issuer))).toEqual(
      { ok: false, reason: 'malformed' }
    );
  });

  it.each([
    ['empty', ''],
    ['two segments', 'a.b'],
    ['four segments', 'a.b.c.d'],
    ['empty segment', 'a..c'],
    ['padding', 'eyJ9.e30=.AA'],
    ['non-base64url', 'ey+J.e30.AA'],
    ['oversized', `${'a'.repeat(4097)}.b.c`],
  ])('rejects malformed input: %s', async (_label, token) => {
    const issuer = await createTestIssuer();
    expect(await verifyIdentityAssertion(token, options(issuer))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('never throws for hostile input', async () => {
    const issuer = await createTestIssuer();
    for (const token of [null, 42, {}, '\u0000.\u0000.\u0000'] as unknown[]) {
      await expect(
        verifyIdentityAssertion(token as string, options(issuer))
      ).resolves.toMatchObject({ ok: false });
    }
  });
});
