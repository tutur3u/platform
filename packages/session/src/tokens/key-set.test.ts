import { describe, expect, it } from 'vitest';
import {
  createWorld,
  DAY,
  keyEntry,
  keySetJson,
  mintClaims,
  NOW,
  ok,
} from '../__tests__/token-fixtures';
import { generateTestKeyPair, signCompact } from '../testing';
import {
  DAY_SECONDS,
  expectedNotAfter,
  keySourceFromKeySet,
  mintToken,
  parseKeySet,
  SIGNING_WINDOW_SECONDS,
  verifyToken,
} from '../tokens';

const verifier = (json: string) =>
  parseKeySet(json, { mode: 'verifier', now: NOW });
const signer = (json: string) =>
  parseKeySet(json, { mode: 'signer', now: NOW, classes: ['identity', 's2s'] });

describe('parseKeySet durations', () => {
  it('uses seconds: a day is 86400 and the signing window 7776000', () => {
    expect(DAY_SECONDS).toBe(86_400);
    expect(SIGNING_WINDOW_SECONDS).toBe(7_776_000);
    expect(expectedNotAfter('identity', 1000, null)).toBe(
      1000 + 7_776_000 + 60 + 86_400
    );
    expect(expectedNotAfter('realtime', 1000, null)).toBe(
      1000 + 7_776_000 + 600 + 86_400
    );
    expect(expectedNotAfter('s2s', 1000, 5000)).toBe(5000 + 300 + 86_400);
    expect(expectedNotAfter('s2s', 1000, 1000 + 7_776_000 + 10)).toBe(
      1000 + 7_776_000 + 300 + 86_400
    );
  });
});

describe('parseKeySet document failures', () => {
  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['a duplicate member', '{"entries":[],"deniedKids":[],"entries":[]}'],
    ['a missing deniedKids', '{"entries":[]}'],
    ['an extra member', '{"entries":[],"deniedKids":[],"x":1}'],
    ['a non-array entries', '{"entries":{},"deniedKids":[]}'],
    ['a bad denied kid', '{"entries":[],"deniedKids":["bad kid"]}'],
  ])(
    'fails the whole set for %s, and its key source is unavailable',
    async (_label, json) => {
      const result = await verifier(json);
      expect(result).toEqual({ ok: false, reason: 'invalid_set' });
      const world = await createWorld(['identity']);
      const minted = await mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions()
      );
      if (!minted.ok) throw new Error(minted.reason);
      expect(
        await verifyToken(
          'identity',
          minted.token,
          world.verifyOptions('identity', {
            keys: keySourceFromKeySet(result, 'identity'),
          })
        )
      ).toEqual({ ok: false, reason: 'keys_unavailable' });
    }
  );

  it('rejects bad options', async () => {
    expect(
      await parseKeySet(keySetJson([]), { mode: 'verifier', now: Number.NaN })
    ).toEqual({
      ok: false,
      reason: 'options',
    });
  });
});

describe('parseKeySet entry rules', () => {
  const reasons = async (
    entries: Array<Record<string, unknown>>,
    mode = verifier,
    denied: string[] = []
  ) => {
    const result = await mode(keySetJson(entries, denied));
    if (!result.ok) throw new Error(result.reason);
    return {
      kept: result.keySet.entries.map((entry) => entry.kid),
      disabled: result.disabled.map((entry) => [entry.kid, entry.reason]),
    };
  };

  it('disables a bad entry alone and still applies deniedKids', async () => {
    const good = await keyEntry({
      kid: 'good',
      class: 'identity',
      status: 'active',
    });
    const bad = await keyEntry({
      kid: 'bad',
      class: 's2s',
      status: 'next',
      extra: { use: 'sig' },
    });
    const gone = await keyEntry({
      kid: 'gone',
      class: 'realtime',
      status: 'active',
    });
    expect(
      await reasons([good.json, bad.json, gone.json, 42 as never], verifier, [
        'gone',
      ])
    ).toEqual({
      kept: ['good'],
      disabled: [
        ['bad', 'shape'],
        ['gone', 'denied'],
        [null, 'shape'],
      ],
    });
  });

  it('disables both of two active keys in a class, so the class stops minting', async () => {
    const one = await keyEntry({
      kid: 'one',
      class: 'identity',
      status: 'active',
      withPrivate: true,
    });
    const two = await keyEntry({
      kid: 'two',
      class: 'identity',
      status: 'active',
      withPrivate: true,
    });
    const other = await keyEntry({
      kid: 's2s-1',
      class: 's2s',
      status: 'active',
      withPrivate: true,
    });
    const result = await signer(keySetJson([one.json, two.json, other.json]));
    expect(ok(result).entries.map((entry) => entry.kid)).toEqual(['s2s-1']);
    const world = await createWorld(['identity']);
    expect(
      await mintToken(
        'identity',
        mintClaims('identity'),
        world.mintOptions({ keySet: ok(result) })
      )
    ).toEqual({ ok: false, reason: 'no_active_key' });
  });

  it('lets a denial resolve an active conflict, because denial runs first', async () => {
    const one = await keyEntry({
      kid: 'one',
      class: 'identity',
      status: 'active',
    });
    const two = await keyEntry({
      kid: 'two',
      class: 'identity',
      status: 'active',
    });
    expect(
      (await reasons([one.json, two.json], verifier, ['one'])).kept
    ).toEqual(['two']);
  });

  it('disables every entry sharing a kid, and two signing next keys', async () => {
    const a = await keyEntry({
      kid: 'same',
      class: 'identity',
      status: 'next',
    });
    const b = await keyEntry({
      kid: 'same',
      class: 's2s',
      status: 'retired',
      retiredAt: NOW - DAY,
    });
    expect((await reasons([a.json, b.json])).disabled).toEqual([
      ['same', 'duplicate_kid'],
      ['same', 'duplicate_kid'],
    ]);
    const n1 = await keyEntry({
      kid: 'n1',
      class: 'identity',
      status: 'next',
      withPrivate: true,
    });
    const n2 = await keyEntry({
      kid: 'n2',
      class: 'identity',
      status: 'next',
      withPrivate: true,
    });
    expect((await reasons([n1.json, n2.json], signer)).disabled).toEqual([
      ['n1', 'next_conflict'],
      ['n2', 'next_conflict'],
    ]);
  });

  it('disables a stray retiredAt and a retired key without one', async () => {
    const stray = await keyEntry({
      kid: 'stray',
      class: 'identity',
      status: 'active',
      withPrivate: true,
    });
    stray.json.retiredAt = NOW - DAY;
    const bare = await keyEntry({
      kid: 'bare',
      class: 'identity',
      status: 'retired',
    });
    expect((await reasons([stray.json, bare.json], signer)).disabled).toEqual([
      ['stray', 'retired_at'],
      ['bare', 'retired_at'],
    ]);
  });

  it.each([-1, 1])(
    'disables a notAfter %i second off the formula',
    async (offset) => {
      const notBefore = NOW - 10 * DAY;
      const active = await keyEntry({
        kid: 'a',
        class: 'identity',
        status: 'active',
        notBefore,
        notAfter: notBefore + 7_776_000 + 60 + 86_400 + offset,
      });
      const retiredAt = NOW - DAY;
      const retired = await keyEntry({
        kid: 'r',
        class: 'access',
        status: 'retired',
        notBefore,
        retiredAt,
        notAfter: retiredAt + 300 + 86_400 + offset,
      });
      expect((await reasons([active.json, retired.json])).disabled).toEqual([
        ['a', 'not_after'],
        ['r', 'not_after'],
      ]);
    }
  );

  it('never lets retirement lengthen the verification window', async () => {
    const notBefore = NOW - 10 * DAY;
    const lateRetire = notBefore + 7_776_000 + 5;
    const lengthened = await keyEntry({
      kid: 'late',
      class: 'identity',
      status: 'retired',
      notBefore,
      retiredAt: lateRetire,
      notAfter: lateRetire + 60 + 86_400,
    });
    const capped = await keyEntry({
      kid: 'capped',
      class: 'identity',
      status: 'retired',
      notBefore,
      retiredAt: lateRetire,
    });
    expect(await reasons([lengthened.json, capped.json])).toEqual({
      kept: ['capped'],
      disabled: [['late', 'not_after']],
    });
  });

  it('disables an entry whose configured publishedAt is in the future', async () => {
    const future = await keyEntry({
      kid: 'f',
      class: 'identity',
      status: 'next',
      publishedAt: NOW + 1,
    });
    expect((await reasons([future.json])).disabled).toEqual([
      ['f', 'published_in_future'],
    ]);
  });

  it('disables private keys in verifier mode and on retired keys in signer mode', async () => {
    const active = await keyEntry({
      kid: 'a',
      class: 'identity',
      status: 'active',
      withPrivate: true,
    });
    expect((await reasons([active.json])).disabled).toEqual([
      ['a', 'private_jwk'],
    ]);
    const retired = await keyEntry({
      kid: 'r',
      class: 'identity',
      status: 'retired',
      retiredAt: NOW - DAY,
      withPrivate: true,
    });
    expect((await reasons([retired.json], signer)).disabled).toEqual([
      ['r', 'private_jwk'],
    ]);
  });

  it('disables a private key whose public half does not match', async () => {
    const other = await generateTestKeyPair();
    const mismatched = await keyEntry({
      kid: 'm',
      class: 'identity',
      status: 'active',
      withPrivate: true,
    });
    mismatched.json.privateJwk = {
      ...(mismatched.json.privateJwk as object),
      d: other.privateJwk.d,
    };
    const swapped = await keyEntry({
      kid: 's',
      class: 's2s',
      status: 'active',
      withPrivate: true,
    });
    swapped.json.privateJwk = other.privateJwk;
    expect(
      (await reasons([mismatched.json, swapped.json], signer)).disabled
    ).toEqual([
      ['m', 'private_jwk'],
      ['s', 'private_jwk'],
    ]);
  });

  it('disables a public key that is not a closed P-256 JWK', async () => {
    const entry = await keyEntry({
      kid: 'p',
      class: 'identity',
      status: 'next',
    });
    entry.json.publicJwk = { ...(entry.json.publicJwk as object), kid: 'p' };
    const offCurve = await keyEntry({
      kid: 'c',
      class: 'identity',
      status: 'retired',
      retiredAt: NOW,
    });
    offCurve.json.publicJwk = {
      ...(offCurve.json.publicJwk as object),
      y: 'A'.repeat(43),
    };
    expect((await reasons([entry.json, offCurve.json])).disabled).toEqual([
      ['p', 'public_jwk'],
      ['c', 'public_jwk'],
    ]);
  });

  it('keeps no private key for a class the signer does not sign', async () => {
    const realtime = await keyEntry({
      kid: 'rt',
      class: 'realtime',
      status: 'active',
      withPrivate: true,
    });
    const parsed = ok(await signer(keySetJson([realtime.json])));
    expect(parsed.entries[0]?.privateKey).toBeNull();
  });

  it('verifies a next key only for iat at or after its notBefore', async () => {
    const next = await keyEntry({
      kid: 'next-1',
      class: 'identity',
      status: 'next',
      notBefore: NOW - 10,
    });
    const result = await verifier(keySetJson([next.json]));
    const world = await createWorld(['identity']);
    const header = JSON.stringify({
      alg: 'ES256',
      typ: 'ttr+identity',
      kid: 'next-1',
    });
    const run = async (iat: number) => {
      const claims = {
        ...mintClaims('identity'),
        iat,
        exp: iat + 60,
        auth_time: iat,
        jti: 'BBBBBBBBBBBBBBBBBBBBBA',
      };
      const token = await signCompact(
        next.pair.privateKey,
        header,
        JSON.stringify(claims)
      );
      return verifyToken(
        'identity',
        token,
        world.verifyOptions('identity', {
          keys: keySourceFromKeySet(result, 'identity'),
        })
      );
    };
    expect((await run(NOW - 10)).ok).toBe(true);
    expect(await run(NOW - 11)).toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('keeps verifying a retired key after the active key lapses', async () => {
    const lapsed = await keyEntry({
      kid: 'old-active',
      class: 'identity',
      status: 'active',
      notBefore: NOW - 200 * DAY,
    });
    const retired = await keyEntry({
      kid: 'retired-1',
      class: 'identity',
      status: 'retired',
      notBefore: NOW - 80 * DAY,
      retiredAt: NOW - 3600,
    });
    const result = await verifier(keySetJson([lapsed.json, retired.json]));
    const world = await createWorld(['identity']);
    const sign = async (kid: string, key: CryptoKey) => {
      const header = JSON.stringify({ alg: 'ES256', typ: 'ttr+identity', kid });
      const claims = {
        ...mintClaims('identity'),
        iat: NOW,
        jti: 'BBBBBBBBBBBBBBBBBBBBBA',
      };
      return verifyToken(
        'identity',
        await signCompact(key, header, JSON.stringify(claims)),
        world.verifyOptions('identity', {
          keys: keySourceFromKeySet(result, 'identity'),
        })
      );
    };
    expect((await sign('retired-1', retired.pair.privateKey)).ok).toBe(true);
    expect(await sign('old-active', lapsed.pair.privateKey)).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
  });
});
