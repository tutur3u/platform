import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  encodeSessionCookieValue,
  parseSessionCookieValue,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  serializeSessionCookie,
  verifySessionCookieMac,
} from './cookie';

const scope = { environment: 'staging' as const, host: 'tuturuuu.com' };
const RAW_KEY = new Uint8Array(32).fill(11);

function importMacKey(hash = 'SHA-256', usages: KeyUsage[] = ['sign']) {
  return crypto.subtle.importKey(
    'raw',
    RAW_KEY,
    { name: 'HMAC', hash },
    false,
    usages
  );
}

describe('MAC vector', () => {
  it('matches an independent HMAC-SHA-256 over the documented input, truncated to 16 bytes', async () => {
    const device = new Uint8Array(16).fill(1);
    const secret = new Uint8Array(32).fill(2);
    const value = await encodeSessionCookieValue({
      device,
      generation: 42,
      secret,
      key: await importMacKey(),
      scope,
    });
    // Pinned literal; the same value comes from Node's HMAC and base64url.
    expect(value).toBe(
      'v1.AQEBAQEBAQEBAQEBAQEBAQ.42.AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI.eUcqO-gbEVvYsIRSmKhkOQ'
    );
    const deviceText = Buffer.from(device).toString('base64url');
    const secretText = Buffer.from(secret).toString('base64url');
    const expected = createHmac('sha256', Buffer.from(RAW_KEY))
      .update(
        `ttr-session-mac/v1|staging|tuturuuu.com|${deviceText}.42.${secretText}`
      )
      .digest()
      .subarray(0, 16)
      .toString('base64url');
    expect(value).toBe(`v1.${deviceText}.42.${secretText}.${expected}`);
  });

  it('refuses keys that are not sign-capable HMAC-SHA-256', async () => {
    const encode = async (key: CryptoKey) =>
      encodeSessionCookieValue({
        device: new Uint8Array(16),
        generation: 0,
        secret: new Uint8Array(32),
        key,
        scope,
      });
    await expect(encode(await importMacKey('SHA-384'))).rejects.toThrow(
      RangeError
    );
    const valid = parseSessionCookieValue(await encode(await importMacKey()));
    if (!valid) throw new Error('fixture');
    expect(
      await verifySessionCookieMac(valid, {
        keys: [await importMacKey('SHA-384')],
        scope,
      })
    ).toBe(false);
    expect(
      await verifySessionCookieMac(valid, {
        keys: [await importMacKey('SHA-256', ['verify'])],
        scope,
      })
    ).toBe(false);
  });

  it.each([
    'tuturuuu.com.',
    'tuturuuu.com:443',
    ' tuturuuu.com',
    'tuturuuu..com',
    '-tuturuuu.com',
  ])('rejects a non-canonical scope host %j', async (host) => {
    const key = await importMacKey();
    await expect(
      encodeSessionCookieValue({
        device: new Uint8Array(16),
        generation: 0,
        secret: new Uint8Array(32),
        key,
        scope: { ...scope, host },
      })
    ).rejects.toThrow(RangeError);
  });
});

describe('serialization and parsing edges', () => {
  it('trims long whitespace runs in linear time', async () => {
    const value = await encodeSessionCookieValue({
      device: new Uint8Array(16),
      generation: 1,
      secret: new Uint8Array(32),
      key: await importMacKey(),
      scope,
    });
    const run = ' \t'.repeat(50_000);
    const started = performance.now();
    expect(
      readSessionCookie(
        `${run}${SESSION_COOKIE_NAME}${run}=${run}${value}${run}`
      )
    ).toMatchObject({ kind: 'present' });
    // An interior run followed by a non-space character is the quadratic case
    // for a regex with a trailing-whitespace alternative.
    const interior = ' '.repeat(100_000);
    expect(readSessionCookie(`a${interior}b=x`)).toEqual({ kind: 'absent' });
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=x${interior}x`)).toEqual({
      kind: 'malformed',
    });
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=${run}`)).toEqual({
      kind: 'malformed',
    });
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('trims only spaces and tabs', async () => {
    const value = await encodeSessionCookieValue({
      device: new Uint8Array(16),
      generation: 1,
      secret: new Uint8Array(32),
      key: await importMacKey(),
      scope,
    });
    expect(
      readSessionCookie(`\t ${SESSION_COOKIE_NAME} \t= \t${value} \t`)
    ).toMatchObject({ kind: 'present' });
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=\n${value}`)).toEqual({
      kind: 'malformed',
    });
    expect(readSessionCookie(`\u00a0${SESSION_COOKIE_NAME}=${value}`)).toEqual({
      kind: 'absent',
    });
  });

  it.each([0.5, 10.5, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'clears for Max-Age %s',
    async (age) => {
      const value = await encodeSessionCookieValue({
        device: new Uint8Array(16),
        generation: 1,
        secret: new Uint8Array(32),
        key: await importMacKey(),
        scope,
      });
      expect(serializeSessionCookie(value, age)).toBe(clearSessionCookie());
    }
  );

  it('never lifts a session value out of another cookie that contains a comma', async () => {
    const value = await encodeSessionCookieValue({
      device: new Uint8Array(16),
      generation: 1,
      secret: new Uint8Array(32),
      key: await importMacKey(),
      scope,
    });
    expect(
      readSessionCookie(`parent=x, ${SESSION_COOKIE_NAME}=${value}`)
    ).toEqual({ kind: 'absent' });
    expect(
      readSessionCookie(
        `parent=x, ${SESSION_COOKIE_NAME}=${value}; ${SESSION_COOKIE_NAME}=${value}`
      )
    ).toMatchObject({
      kind: 'present',
    });
    expect(
      readSessionCookie(`a=1;\t${SESSION_COOKIE_NAME}=${value}\t`)
    ).toMatchObject({ kind: 'present' });
    expect(readSessionCookie(`a=1;\n${SESSION_COOKIE_NAME}=${value}`)).toEqual({
      kind: 'absent',
    });
  });
});
