import { describe, expect, it } from 'vite-plus/test';
import { randomKey, randomToken } from './__tests__/harness';
import { parseKeySet } from './key-set';
import {
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  signRequestHeaders,
  verifyRequestAuth,
} from './request-auth';

const NOW = 1_800_000_000_000;
const body = new TextEncoder().encode('{"input":{},"permit":{}}');
const key = randomKey();

async function headersFor(
  over: Partial<Parameters<typeof signRequestHeaders>[0]> = {}
) {
  return new Headers(
    await signRequestHeaders({
      key: key.raw,
      audience: 'production',
      method: 'POST',
      path: '/v1/saml/sign',
      body,
      nowMs: NOW,
      ...over,
    })
  );
}

const verify = (
  headers: Headers,
  over: Partial<Parameters<typeof verifyRequestAuth>[0]> = {}
) =>
  verifyRequestAuth({
    audience: 'production',
    method: 'POST',
    path: '/v1/saml/sign',
    headers,
    body,
    keys: parseKeySet(key.text),
    nowMs: NOW,
    ...over,
  });

describe('request HMAC', () => {
  it('accepts a correctly signed request and returns its nonce', async () => {
    const nonce = randomToken();
    const result = await verify(await headersFor({ nonce }));
    expect(result).toEqual({ ok: true, nonce, timestampMs: NOW });
  });

  it.each([
    ['another key', { keys: parseKeySet(randomKey().text) }],
    ['a changed body', { body: new TextEncoder().encode('{"input":{}}') }],
    ['a changed method', { method: 'PUT' }],
    ['a changed path', { path: '/v1/saml/sign2' }],
    ['another environment', { audience: 'local' }],
  ])('refuses a bad signature: %s', async (_label, over) => {
    expect(await verify(await headersFor(), over)).toEqual({
      ok: false,
      error: 'unauthenticated',
    });
  });

  it('refuses a flipped signature byte and a changed nonce', async () => {
    const headers = await headersFor();
    const signature = headers.get(HEADER_SIGNATURE) ?? '';
    const flipped = new Headers(headers);
    flipped.set(
      HEADER_SIGNATURE,
      `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    );
    expect((await verify(flipped)).ok).toBe(false);
    const renonced = new Headers(headers);
    renonced.set(HEADER_NONCE, randomToken());
    expect((await verify(renonced)).ok).toBe(false);
  });

  it.each([60_001, -60_001, 61_000, -61_000, 3_600_000])(
    'refuses a timestamp %i ms from the Worker clock',
    async (offset) => {
      const headers = await headersFor({ nowMs: NOW + offset });
      expect(await verify(headers)).toEqual({
        ok: false,
        error: 'unauthenticated',
      });
    }
  );

  it('accepts up to 60 seconds of skew', async () => {
    expect((await verify(await headersFor({ nowMs: NOW + 60_000 }))).ok).toBe(
      true
    );
    expect((await verify(await headersFor({ nowMs: NOW - 60_000 }))).ok).toBe(
      true
    );
  });

  it.each([
    [HEADER_TIMESTAMP, '1800000000'],
    [HEADER_TIMESTAMP, '01800000000000'],
    [HEADER_NONCE, 'short'],
    [HEADER_NONCE, 'a'.repeat(44)],
    [HEADER_SIGNATURE, 'not-base64url!'],
  ])('refuses a malformed %s header', async (name, value) => {
    const headers = await headersFor();
    headers.set(name, value);
    expect((await verify(headers)).ok).toBe(false);
  });

  it('refuses missing headers and never accepts a bearer token', async () => {
    expect((await verify(new Headers())).ok).toBe(false);
    expect(
      (await verify(new Headers({ authorization: `Bearer ${key.text}` }))).ok
    ).toBe(false);
  });

  it('accepts the previous key during a rotation and refuses without keys', async () => {
    const next = randomKey();
    const rotation = parseKeySet(
      JSON.stringify({ current: next.text, previous: key.text })
    );
    expect((await verify(await headersFor(), { keys: rotation })).ok).toBe(
      true
    );
    expect(await verify(await headersFor(), { keys: null })).toEqual({
      ok: false,
      error: 'misconfigured',
    });
    expect(await verify(await headersFor(), { audience: null })).toEqual({
      ok: false,
      error: 'misconfigured',
    });
  });
});

describe('key sets', () => {
  it('parses one key or a current/previous pair and nothing else', () => {
    expect(parseKeySet(key.text)?.previous).toBeNull();
    for (const raw of [
      undefined,
      '',
      'short',
      `${key.text}=`,
      JSON.stringify({ current: key.text, extra: key.text }),
      JSON.stringify({ previous: key.text }),
      JSON.stringify([key.text]),
    ]) {
      expect(parseKeySet(raw)).toBeNull();
    }
  });
});
