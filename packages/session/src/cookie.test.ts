import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  encodeSessionCookieValue,
  parseSessionCookieValue,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  serializeSessionCookie,
  sessionCookieMaxAge,
  verifySessionCookieMac,
} from './cookie';

const scope = { environment: 'local' as const, host: 'tuturuuu.localhost' };

async function macKey() {
  return crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

async function cookieValue(
  key: CryptoKey,
  generation = 7,
  cookieScope = scope
) {
  return encodeSessionCookieValue({
    device: crypto.getRandomValues(new Uint8Array(16)),
    generation,
    secret: crypto.getRandomValues(new Uint8Array(32)),
    key,
    scope: cookieScope,
  });
}

describe('session cookie codec', () => {
  it('round-trips a canonical value under the size cap', async () => {
    const value = await cookieValue(await macKey());
    expect(value.length).toBeLessThanOrEqual(128);
    expect(parseSessionCookieValue(value)).toMatchObject({
      version: 'v1',
      generation: 7,
    });
  });

  it.each(['007', '-1', '+1', '1.0', '2147483648', '99999999999'])(
    'rejects non-canonical or out-of-range generation %s',
    async (generation) => {
      const value = await cookieValue(await macKey());
      const parts = value.split('.');
      parts[2] = generation;
      expect(parseSessionCookieValue(parts.join('.'))).toBeNull();
    }
  );

  it('rejects other versions, wrong lengths, padding and trailing bits', async () => {
    const value = await cookieValue(await macKey());
    const [, device = '', generation, secret = '', mac] = value.split('.');
    expect(parseSessionCookieValue(value.replace(/^v1/, 'v2'))).toBeNull();
    expect(
      parseSessionCookieValue(
        `v1.${device.slice(1)}.${generation}.${secret}.${mac}`
      )
    ).toBeNull();
    expect(
      parseSessionCookieValue(`v1.${device}.${generation}.${secret}=.${mac}`)
    ).toBeNull();
    // A 22-character segment carries 4 spare bits; 'B' sets one of them.
    expect(
      parseSessionCookieValue(
        `v1.${device.slice(0, -1)}B.${generation}.${secret}.${mac}`
      )
    ).toBeNull();
  });

  it('treats duplicates as ambiguous, including across split Cookie headers', async () => {
    const value = await cookieValue(await macKey());
    expect(
      readSessionCookie(
        `a=1; ${SESSION_COOKIE_NAME}=${value}; ${SESSION_COOKIE_NAME}=${value}`
      )
    ).toEqual({
      kind: 'ambiguous',
    });
    expect(
      readSessionCookie([
        `${SESSION_COOKIE_NAME}=${value}`,
        `b=2; ${SESSION_COOKIE_NAME}=${value}`,
      ])
    ).toEqual({
      kind: 'ambiguous',
    });
    expect(
      readSessionCookie(
        `${SESSION_COOKIE_NAME}=${value}; ${SESSION_COOKIE_NAME}`
      )
    ).toEqual({ kind: 'ambiguous' });
  });

  it('reports absent and malformed cookies', async () => {
    expect(readSessionCookie(null)).toEqual({ kind: 'absent' });
    expect(readSessionCookie('__Host-ttr_session_other=1; sb-x=1')).toEqual({
      kind: 'absent',
    });
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}="quoted"`)).toEqual({
      kind: 'malformed',
    });
    const value = await cookieValue(await macKey());
    expect(
      readSessionCookie(`x=1; ${SESSION_COOKIE_NAME}=${value}`)
    ).toMatchObject({ kind: 'present' });
  });
});

describe('cookie admission MAC', () => {
  it('accepts the current key and one previous key', async () => {
    const previous = await macKey();
    const current = await macKey();
    const cookie = parseSessionCookieValue(await cookieValue(previous));
    if (!cookie) throw new Error('fixture');
    expect(
      await verifySessionCookieMac(cookie, { keys: [current, previous], scope })
    ).toBe(true);
    expect(
      await verifySessionCookieMac(cookie, { keys: [current], scope })
    ).toBe(false);
  });

  it('binds the MAC to environment, host, generation and secret', async () => {
    const key = await macKey();
    const cookie = parseSessionCookieValue(await cookieValue(key));
    if (!cookie) throw new Error('fixture');
    expect(
      await verifySessionCookieMac(cookie, {
        keys: [key],
        scope: { ...scope, environment: 'staging' },
      })
    ).toBe(false);
    expect(
      await verifySessionCookieMac(cookie, {
        keys: [key],
        scope: { ...scope, host: 'tasks.tuturuuu.localhost' },
      })
    ).toBe(false);
    expect(
      await verifySessionCookieMac(
        { ...cookie, generation: cookie.generation + 1 },
        { keys: [key], scope }
      )
    ).toBe(false);
    expect(
      await verifySessionCookieMac(cookie, {
        keys: [key],
        scope: { ...scope, host: 'TUTURUUU.localhost' },
      })
    ).toBe(true);
  });

  it('fails closed with no keys, too many keys or an invalid host', async () => {
    const key = await macKey();
    const cookie = parseSessionCookieValue(await cookieValue(key));
    if (!cookie) throw new Error('fixture');
    expect(await verifySessionCookieMac(cookie, { keys: [], scope })).toBe(
      false
    );
    expect(
      await verifySessionCookieMac(cookie, { keys: [key, key, key], scope })
    ).toBe(false);
    expect(
      await verifySessionCookieMac(cookie, {
        keys: [key],
        scope: { ...scope, host: 'bad host/' },
      })
    ).toBe(false);
  });
});

describe('cookie serialization', () => {
  it('rounds Max-Age down and clears at or past the deadline', async () => {
    expect(sessionCookieMaxAge(10_999, 0)).toBe(10);
    expect(sessionCookieMaxAge(1_000, 1_000)).toBe(0);
    const value = await cookieValue(await macKey());
    expect(serializeSessionCookie(value, 10)).toBe(
      `${SESSION_COOKIE_NAME}=${value}; Max-Age=10; Path=/; Secure; HttpOnly; SameSite=Lax`
    );
    expect(serializeSessionCookie(value, 0)).toBe(clearSessionCookie());
    expect(serializeSessionCookie('not-a-cookie', 10)).toBe(
      clearSessionCookie()
    );
    expect(clearSessionCookie()).toBe(
      `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`
    );
    expect(clearSessionCookie()).not.toMatch(/Domain/i);
  });

  it('refuses to encode out-of-range input', async () => {
    const key = await macKey();
    await expect(cookieValue(key, -1)).rejects.toThrow(RangeError);
    await expect(cookieValue(key, 1, { ...scope, host: '' })).rejects.toThrow(
      RangeError
    );
  });
});
