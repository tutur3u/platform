/** The identity verifier's encoding negatives, run against every class. */
import { describe, expect, it } from 'vitest';
import { createWorld, mintClaims, NOW } from '../__tests__/token-fixtures';
import { encodeBase64Url, utf8 } from '../encoding';
import { signCompact } from '../testing';
import {
  TOKEN_CLASSES,
  TOKEN_TYPES,
  type TokenClass,
  verifyToken,
} from '../tokens';

const JTI = 'BBBBBBBBBBBBBBBBBBBBBA';

async function harness(tokenClass: TokenClass) {
  const world = await createWorld([tokenClass]);
  const kid = `${tokenClass}-1`;
  const header = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      alg: 'ES256',
      typ: TOKEN_TYPES[tokenClass],
      kid,
      ...extra,
    });
  const claims = (patch: Record<string, unknown> = {}) =>
    JSON.stringify({ ...mintClaims(tokenClass), iat: NOW, jti: JTI, ...patch });
  const signRaw = (headerJson: string, claimsJson: string) =>
    signCompact(world.pairs[tokenClass].privateKey, headerJson, claimsJson);
  const verify = async (token: unknown) => {
    const result = await verifyToken(
      tokenClass,
      token as string,
      world.verifyOptions(tokenClass)
    );
    return result.ok ? 'ok' : result.reason;
  };
  const raw = async (headerJson: string, claimsJson: string) =>
    verify(await signRaw(headerJson, claimsJson));
  return { kid, header, claims, signRaw, verify, raw };
}

describe.each(TOKEN_CLASSES)('%s encoding negatives', (tokenClass) => {
  it('accepts the well-formed token', async () => {
    const h = await harness(tokenClass);
    expect(await h.raw(h.header(), h.claims())).toBe('ok');
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
    const h = await harness(tokenClass);
    expect(await h.verify(token)).toBe('malformed');
  });

  it('never throws for hostile input', async () => {
    const h = await harness(tokenClass);
    for (const token of [null, 42, {}, '\u0000.\u0000.\u0000']) {
      expect(await h.verify(token)).not.toBe('ok');
    }
  });

  it('rejects duplicate members, including an escaped spelling', async () => {
    const h = await harness(tokenClass);
    expect(
      await h.raw(`${h.header().slice(0, -1)},"kid":"${h.kid}"}`, h.claims())
    ).toBe('malformed');
    expect(
      await h.raw(h.header(), `${h.claims().slice(0, -1)},"exp":${NOW + 1}}`)
    ).toBe('malformed');
    expect(
      await h.raw(
        h.header(),
        `${h.claims().slice(0, -1)},"\\u0065xp":${NOW + 1}}`
      )
    ).toBe('malformed');
  });

  it('treats __proto__ as an ordinary member and rejects it', async () => {
    const h = await harness(tokenClass);
    const typ = TOKEN_TYPES[tokenClass];
    expect(
      await h.raw(
        `{"alg":"ES256","typ":"${typ}","__proto__":{"kid":"${h.kid}"}}`,
        h.claims()
      )
    ).toBe('header');
    expect(
      await h.raw(h.header(), `${h.claims().slice(0, -1)},"__proto__":{}}`)
    ).toBe('claims');
    const { jti: _jti, ...rest } = JSON.parse(h.claims()) as Record<
      string,
      unknown
    >;
    const smuggled = `${JSON.stringify(rest).slice(0, -1)},"__proto__":{"jti":"${JTI}"}}`;
    expect(await h.raw(h.header(), smuggled)).toBe('claims');
  });

  it.each([
    ['exponent', '1.8e9'],
    ['fraction', `${NOW}.0`],
    ['negative zero', '-0'],
    ['huge', '99999999999999999999'],
  ])('rejects a non-canonical %s number', async (_label, literal) => {
    const h = await harness(tokenClass);
    const { iat: _iat, ...rest } = JSON.parse(h.claims()) as Record<
      string,
      unknown
    >;
    expect(
      await h.raw(
        h.header(),
        `${JSON.stringify(rest).slice(0, -1)},"iat":${literal}}`
      )
    ).toBe('malformed');
  });

  it.each([
    ['type', { typ: 'JWT' }],
    ['header', { alg: 'none' }],
    ['header', { alg: 'HS256' }],
    ['header', { kid: 'bad kid' }],
    ['header', { jku: 'https://evil.test' }],
    ['header', { jwk: {} }],
    ['header', { crit: ['exp'] }],
    ['header', { b64: false }],
  ])('rejects %s header %j', async (expected, extra) => {
    const h = await harness(tokenClass);
    expect(await h.raw(h.header(extra), h.claims())).toBe(expected);
  });

  it('rejects a tampered payload and a DER-length signature', async () => {
    const h = await harness(tokenClass);
    const token = await h.signRaw(h.header(), h.claims());
    const [header, payload, signature] = token.split('.');
    const forged = encodeBase64Url(utf8(h.claims({ exp: NOW + 2 })));
    expect(await h.verify(`${header}.${forged}.${signature}`)).toBe(
      'signature'
    );
    expect(
      await h.verify(
        `${header}.${payload}.${encodeBase64Url(new Uint8Array(72))}`
      )
    ).toBe('signature');
  });

  it('applies the clock window', async () => {
    const h = await harness(tokenClass);
    expect(
      await h.raw(h.header(), h.claims({ iat: NOW + 6, exp: NOW + 30 }))
    ).toBe('time');
    expect(await h.raw(h.header(), h.claims({ iat: NOW - 30, exp: NOW }))).toBe(
      'time'
    );
    expect(await h.raw(h.header(), h.claims({ exp: NOW }))).toBe('time');
    expect(await h.raw(h.header(), h.claims({ iat: '1800000000' }))).toBe(
      'claims'
    );
  });
});
