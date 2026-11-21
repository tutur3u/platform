/** Key class and lifetime checks through the production identity entry point. */
import { describe, expect, it } from 'vitest';
import { DAY, keyEntry, keySetJson, NOW } from './__tests__/token-fixtures';
import {
  bareKeySource,
  createTestIssuer,
  defaultTestClaims,
  signCompact,
  TEST_AUDIENCE,
  TEST_ISSUER,
} from './testing';
import { keySourceFromKeySet, parseKeySet } from './tokens';
import { type VerifyOptions, verifyIdentityAssertion } from './verify';

const options = (keys: VerifyOptions['keys'], now = NOW): VerifyOptions => ({
  issuer: TEST_ISSUER,
  environment: 'local',
  audience: TEST_AUDIENCE,
  keys,
  now: () => now,
});

const header = (kid: string) =>
  JSON.stringify({ alg: 'ES256', typ: 'ttr+identity', kid });

describe('verifyIdentityAssertion key acceptance', () => {
  it('accepts an in-lifetime identity key from the internal key set', async () => {
    const key = await keyEntry({
      kid: 'id-1',
      class: 'identity',
      status: 'active',
    });
    const keys = keySourceFromKeySet(
      await parseKeySet(keySetJson([key.json]), { mode: 'verifier', now: NOW }),
      'identity'
    );
    const token = await signCompact(
      key.pair.privateKey,
      header('id-1'),
      JSON.stringify(defaultTestClaims(NOW))
    );
    expect((await verifyIdentityAssertion(token, options(keys))).ok).toBe(true);
  });

  it('rejects a retired identity key past its notAfter', async () => {
    const retiredAt = NOW - 2 * DAY;
    const key = await keyEntry({
      kid: 'id-old',
      class: 'identity',
      status: 'retired',
      notBefore: NOW - 30 * DAY,
      retiredAt,
    });
    const notAfter = retiredAt + 60 + 86_400;
    expect(key.json.notAfter).toBe(notAfter);
    const parsed = await parseKeySet(keySetJson([key.json]), {
      mode: 'verifier',
      now: NOW,
    });
    const iat = notAfter - 30;
    const claims = { ...defaultTestClaims(iat), auth_time: iat };
    const token = await signCompact(
      key.pair.privateKey,
      header('id-old'),
      JSON.stringify(claims)
    );
    const keys = keySourceFromKeySet(parsed, 'identity');
    expect(
      (await verifyIdentityAssertion(token, options(keys, notAfter - 1))).ok
    ).toBe(true);
    expect(
      await verifyIdentityAssertion(token, options(keys, notAfter))
    ).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
  });

  it('rejects a key of another class, even from a lookup that returns it', async () => {
    const issuer = await createTestIssuer('s2s-1', {
      class: 's2s',
      notBefore: NOW - DAY,
      notAfter: NOW + DAY,
    });
    const token = await issuer.sign(defaultTestClaims(NOW), {
      alg: 'ES256',
      typ: 'ttr+identity',
      kid: 's2s-1',
    });
    expect(await verifyIdentityAssertion(token, options(issuer.keys))).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
    const key = await keyEntry({
      kid: 's2s-2',
      class: 's2s',
      status: 'active',
    });
    const parsed = await parseKeySet(keySetJson([key.json]), {
      mode: 'verifier',
      now: NOW,
    });
    const other = await signCompact(
      key.pair.privateKey,
      header('s2s-2'),
      JSON.stringify(defaultTestClaims(NOW))
    );
    for (const keys of [
      keySourceFromKeySet(parsed, 'identity'),
      keySourceFromKeySet(parsed, 's2s'),
    ]) {
      expect(await verifyIdentityAssertion(other, options(keys))).toEqual({
        ok: false,
        reason: 'unknown_key',
      });
    }
  });

  it('rejects a token issued before the key notBefore', async () => {
    const issuer = await createTestIssuer('id-1', {
      class: 'identity',
      notBefore: NOW + 1,
      notAfter: NOW + DAY,
    });
    expect(
      await verifyIdentityAssertion(
        await issuer.sign(defaultTestClaims(NOW)),
        options(issuer.keys)
      )
    ).toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('maps malformed key metadata to keys_unavailable', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    for (const record of [
      { key: issuer.publicKey, class: 'identity', notBefore: 0 },
      {
        key: issuer.publicKey,
        class: 'admin',
        notBefore: 0,
        notAfter: NOW + 60,
      },
      {
        key: issuer.publicKey,
        class: 'identity',
        notBefore: 0,
        notAfter: Number.POSITIVE_INFINITY,
      },
      { key: null, class: 'identity', notBefore: 0, notAfter: NOW + 60 },
      issuer.publicKey,
    ]) {
      const keys = {
        get: async () => record,
      } as unknown as VerifyOptions['keys'];
      expect(await verifyIdentityAssertion(token, options(keys))).toEqual({
        ok: false,
        reason: 'keys_unavailable',
      });
    }
  });

  it('gives the bare adapter no open default lifetime', () => {
    expect(() =>
      bareKeySource('k', null, { class: 'identity', notBefore: 0 } as never)
    ).toThrow(TypeError);
    expect(() =>
      bareKeySource('k', null, {
        class: 'identity',
        notBefore: 0,
        notAfter: Number.POSITIVE_INFINITY,
      })
    ).toThrow(TypeError);
  });

  it('rejects a configured audience that is not a mount', async () => {
    const issuer = await createTestIssuer();
    const token = await issuer.sign(defaultTestClaims(NOW));
    expect(
      await verifyIdentityAssertion(token, {
        ...options(issuer.keys),
        audience: 'service:tasks' as never,
      })
    ).toEqual({ ok: false, reason: 'audience' });
  });
});
