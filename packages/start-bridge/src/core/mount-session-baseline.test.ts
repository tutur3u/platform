import { describe, expect, it } from 'vitest';
import {
  hasAmbiguousSupabaseSession,
  reduceMountedSessionCookieHeader,
  stripMountedSupabaseWrites,
} from './mount-isolation';

const KEY = 'sb-abcdefghijklmnop-auth-token';

function encode(session: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(session));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `base64-${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`;
}

function decode(value: string) {
  const body = value.slice('base64-'.length);
  const base64 = body.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  );
}

const SESSION = {
  access_token: 'access.fixture.jwt',
  refresh_token: 'refresh-fixture',
  provider_refresh_token: 'provider-refresh-fixture',
  expires_at: 2_000_000_000,
};

function cookies(header: string | null) {
  return new Map(
    (header ?? '').split('; ').map((pair) => {
      const equals = pair.indexOf('=');
      return [pair.slice(0, equals), pair.slice(equals + 1)] as const;
    })
  );
}

describe('baseline mounted session reduction', () => {
  it('keeps other cookies and withholds the refresh token', () => {
    const header = reduceMountedSessionCookieHeader(
      `NEXT_LOCALE=vi; ${KEY}=${encode(SESSION)}; theme=dark`
    );
    const map = cookies(header);
    expect(map.get('NEXT_LOCALE')).toBe('vi');
    expect(map.get('theme')).toBe('dark');
    const session = decode(map.get(KEY) as string);
    expect(session.access_token).toBe('access.fixture.jwt');
    expect(session.refresh_token).toBe('');
    expect(session).not.toHaveProperty('provider_refresh_token');
  });

  it('joins chunked sessions into one reduced cookie', () => {
    const value = encode(SESSION);
    const header = reduceMountedSessionCookieHeader(
      `${KEY}.0=${value.slice(0, 20)}; ${KEY}.1=${value.slice(20)}`
    );
    const map = cookies(header);
    expect([...map.keys()]).toEqual([KEY]);
    expect(decode(map.get(KEY) as string).refresh_token).toBe('');
  });

  it('never forwards the first-party session handle', () => {
    expect(
      reduceMountedSessionCookieHeader('__Host-ttr_session=opaque; theme=dark')
    ).toBe('theme=dark');
  });

  it('withholds a malformed session entirely', () => {
    expect(reduceMountedSessionCookieHeader(`${KEY}=garbage`)).toBeNull();
  });
});

describe('ambiguous Supabase sessions', () => {
  const value = encode(SESSION);
  it.each([
    [`${KEY}=${value}; ${KEY}=${value}`, true],
    [`${KEY}=${value}; ${KEY}.0=${value}`, true],
    [`${KEY}.0=a; ${KEY}.0=b`, true],
    [`${KEY}=${value}`, false],
    [`${KEY}.0=a; ${KEY}.1=b`, false],
    ['NEXT_LOCALE=vi; NEXT_LOCALE=en', false],
    [null, false],
  ])('%s ambiguous=%s', (header, ambiguous) => {
    expect(hasAmbiguousSupabaseSession(header)).toBe(ambiguous);
  });
});

describe('mounted Supabase writes', () => {
  function withCookies(...values: string[]) {
    const response = new Response('ok');
    for (const value of values) response.headers.append('set-cookie', value);
    return response;
  }

  it('drops session writes and deletions, keeping other cookies', () => {
    const result = stripMountedSupabaseWrites(
      withCookies(
        `${KEY}=${encode(SESSION)}; Path=/`,
        `${KEY}.0=; Max-Age=0; Path=/`,
        '__Host-ttr_session=forged; Path=/; Secure',
        'NEXT_LOCALE=vi; Path=/learn'
      )
    );
    expect(result.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=vi; Path=/learn',
    ]);
  });

  it('keeps only deletions on the central logout path', () => {
    const result = stripMountedSupabaseWrites(
      withCookies(
        `${KEY}=; Max-Age=0; Path=/`,
        `${KEY}=${encode(SESSION)}; Path=/`
      ),
      true
    );
    expect(result.headers.getSetCookie()).toEqual([
      `${KEY}=; Max-Age=0; Path=/`,
    ]);
  });

  it('returns the same response when nothing is dropped', () => {
    const response = withCookies('NEXT_LOCALE=vi; Path=/learn');
    expect(stripMountedSupabaseWrites(response)).toBe(response);
  });
});
