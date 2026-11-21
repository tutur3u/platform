import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createWorld,
  DAY,
  keyEntry,
  keySetJson,
  mintClaims,
  NOW,
} from '../__tests__/token-fixtures';
import { signCompact } from '../testing';
import {
  jwkThumbprint,
  jwksDocument,
  keySourceFromJwks,
  keySourceFromKeySet,
  mintToken,
  parseJwks,
  parseKeySet,
  verifyToken,
} from '../tokens';

describe('jwkThumbprint', () => {
  it('hashes the RFC 7638 canonical JSON of crv, kty, x and y only', async () => {
    const x = 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU';
    const y = 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0';
    const canonical = `{"crv":"P-256","kty":"EC","x":"${x}","y":"${y}"}`;
    const expected = createHash('sha256').update(canonical).digest('base64url');
    expect(await jwkThumbprint({ kty: 'EC', crv: 'P-256', x, y })).toBe(
      expected
    );
    expect(
      await jwkThumbprint({
        y,
        x,
        kty: 'EC',
        crv: 'P-256',
        kid: 'k',
        thumbprint: 'forged',
      } as never)
    ).toBe(expected);
  });
});

describe('jwksDocument', () => {
  it('publishes next, active and retired keys before notAfter, without denied keys', async () => {
    const active = await keyEntry({
      kid: 'a',
      class: 'identity',
      status: 'active',
    });
    const next = await keyEntry({
      kid: 'n',
      class: 'identity',
      status: 'next',
      notBefore: NOW + DAY,
      publishedAt: NOW,
    });
    const retired = await keyEntry({
      kid: 'r',
      class: 's2s',
      status: 'retired',
      retiredAt: NOW - DAY,
    });
    const expired = await keyEntry({
      kid: 'x',
      class: 's2s',
      status: 'retired',
      notBefore: NOW - 30 * DAY,
      retiredAt: NOW - 2 * DAY,
    });
    const denied = await keyEntry({
      kid: 'd',
      class: 'access',
      status: 'active',
    });
    const parsed = await parseKeySet(
      keySetJson(
        [active.json, next.json, retired.json, expired.json, denied.json],
        ['d']
      ),
      { mode: 'verifier', now: NOW }
    );
    if (!parsed.ok) throw new Error(parsed.reason);
    const document = jwksDocument(parsed.keySet, NOW);
    expect(document.keys.map((key) => key.kid)).toEqual(['a', 'n', 'r']);
    expect(Object.keys(document.keys[0] ?? {}).sort()).toEqual(
      [
        'alg',
        'crv',
        'exp',
        'kid',
        'kty',
        'nbf',
        'ttr:class',
        'use',
        'x',
        'y',
      ].sort()
    );
    expect(document.keys[1]).toMatchObject({
      'ttr:class': 'identity',
      nbf: NOW + DAY,
      exp: next.json.notAfter,
      use: 'sig',
      alg: 'ES256',
    });
  });
});

describe('JWKS-fed verification', () => {
  const setup = async () => {
    const world = await createWorld(['identity']);
    const minted = await mintToken(
      'identity',
      mintClaims('identity'),
      world.mintOptions()
    );
    if (!minted.ok) throw new Error(minted.reason);
    const jwk = jwksDocument(world.verifier, NOW).keys[0];
    if (!jwk) throw new Error('no key');
    const verify = async (body: string, now = NOW) =>
      verifyToken(
        'identity',
        minted.token,
        world.verifyOptions('identity', {
          keys: keySourceFromJwks(await parseJwks(body), 'identity'),
          now: () => now,
        })
      );
    return { world, minted, jwk, verify };
  };

  it('accepts a served key of the class', async () => {
    const { verify, world } = await setup();
    expect((await verify(world.jwksBody)).ok).toBe(true);
  });

  it.each(['ttr:class', 'nbf', 'exp'])(
    'rejects a JWK with no %s',
    async (member) => {
      const { verify, jwk } = await setup();
      const { [member as keyof typeof jwk]: _dropped, ...rest } = jwk;
      expect(await verify(JSON.stringify({ keys: [rest] }))).toEqual({
        ok: false,
        reason: 'unknown_key',
      });
    }
  );

  it('rejects a JWK of another class, an extra member and a duplicated kid', async () => {
    const { verify, jwk } = await setup();
    for (const keys of [
      [{ ...jwk, 'ttr:class': 's2s' }],
      [{ ...jwk, key_ops: ['verify'] }],
      [jwk, jwk],
    ]) {
      expect(await verify(JSON.stringify({ keys }))).toEqual({
        ok: false,
        reason: 'unknown_key',
      });
    }
  });

  it('rejects a cached JWK past its exp and a token issued before its nbf', async () => {
    const { verify, jwk } = await setup();
    expect(
      await verify(JSON.stringify({ keys: [{ ...jwk, exp: NOW }] }))
    ).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
    expect(
      await verify(JSON.stringify({ keys: [{ ...jwk, nbf: NOW + 1 }] }))
    ).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
  });

  it('fails closed on a body that is not a strict JWKS', async () => {
    const { verify } = await setup();
    for (const body of ['', '{"keys":{}}', '{"keys":[],"x":1}', 'null']) {
      expect(await verify(body)).toEqual({
        ok: false,
        reason: 'keys_unavailable',
      });
    }
  });
});

describe('key acceptance through both key sources', () => {
  it('rejects denied, expired, not-yet-valid and wrong-class keys', async () => {
    const world = await createWorld(['identity']);
    const header = (kid: string) =>
      JSON.stringify({ alg: 'ES256', typ: 'ttr+identity', kid });
    const claims = JSON.stringify({
      ...mintClaims('identity'),
      iat: NOW,
      jti: 'BBBBBBBBBBBBBBBBBBBBBA',
    });
    const cases = [
      {
        spec: { kid: 'denied', class: 'identity', status: 'active' },
        denied: ['denied'],
      },
      {
        spec: {
          kid: 'expired',
          class: 'identity',
          status: 'retired',
          notBefore: NOW - 30 * DAY,
          retiredAt: NOW - 2 * DAY,
        },
      },
      {
        spec: {
          kid: 'early',
          class: 'identity',
          status: 'next',
          notBefore: NOW + 1,
          publishedAt: NOW,
        },
      },
      { spec: { kid: 'wrong', class: 's2s', status: 'active' } },
    ] as const;
    for (const { spec, ...rest } of cases) {
      const key = await keyEntry({ ...spec });
      const denied = 'denied' in rest ? [...rest.denied] : [];
      const json = keySetJson([key.json], denied);
      const result = await parseKeySet(json, { mode: 'verifier', now: NOW });
      if (!result.ok) throw new Error(result.reason);
      const token = await signCompact(
        key.pair.privateKey,
        header(spec.kid),
        claims
      );
      const servedJwks = JSON.stringify({
        keys: [
          {
            ...key.pair.publicJwk,
            kid: spec.kid,
            use: 'sig',
            alg: 'ES256',
            'ttr:class': spec.class,
            nbf: key.json.notBefore,
            exp: key.json.notAfter,
          },
        ].filter(() => denied.length === 0),
      });
      for (const keys of [
        keySourceFromKeySet(result, 'identity'),
        keySourceFromJwks(await parseJwks(servedJwks), 'identity'),
      ]) {
        expect(
          await verifyToken(
            'identity',
            token,
            world.verifyOptions('identity', { keys })
          ),
          spec.kid
        ).toEqual({ ok: false, reason: 'unknown_key' });
      }
    }
  });
});
