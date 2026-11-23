import { describe, expect, it } from 'vitest';
import {
  assertMountIsolationConfig,
  isolateMountedCookieHeader,
  keepFirstLocaleCookie,
  reduceMountedSessionCookieHeader,
  reduceSupabaseSessionValue,
  scopeMountedResponseCookies,
  scopeOwnedSetCookie,
} from './mount-isolation';

const config = { ownedCookies: ['NEXT_LOCALE'] };
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
  provider_token: 'provider-fixture',
  provider_refresh_token: 'provider-refresh-fixture',
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id: 'user-fixture', user_metadata: { name: 'Nguyễn Văn A' } },
};

function cookieMap(header: string | null) {
  return new Map(
    (header ?? '')
      .split('; ')
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at), pair.slice(at + 1)] as const;
      })
  );
}

describe('reduceSupabaseSessionValue', () => {
  it('withholds refresh and provider tokens and keeps the access token', () => {
    const reduced = reduceSupabaseSessionValue(encode(SESSION));
    expect(reduced).not.toBeNull();
    const session = decode(reduced as string);
    expect(session.access_token).toBe('access.fixture.jwt');
    expect(session.refresh_token).toBe('');
    expect(session).not.toHaveProperty('provider_token');
    expect(session).not.toHaveProperty('provider_refresh_token');
    expect(session.user.user_metadata.name).toBe('Nguyễn Văn A');
    expect(reduced).not.toContain('refresh-fixture');
  });

  it('accepts the legacy URI-encoded JSON form', () => {
    const reduced = reduceSupabaseSessionValue(
      encodeURIComponent(JSON.stringify(SESSION))
    );
    expect(decode(reduced as string).refresh_token).toBe('');
  });

  it.each([
    'base64-%%%',
    'base64-',
    encode(['not', 'a', 'session']),
    encode({ refresh_token: 'only-refresh' }),
    encode({ access_token: '' }),
    'garbage',
  ])('withholds a malformed session (%s)', (value) => {
    expect(reduceSupabaseSessionValue(value)).toBeNull();
  });
});

describe('isolateMountedCookieHeader', () => {
  it('keeps only owned cookies, the fence and the reduced session', () => {
    const header = [
      'NEXT_LOCALE=vi',
      '__Host-tuturuuu_app_signed_out=1',
      `${KEY}=${encode(SESSION)}`,
      `${KEY}-code-verifier=pkce-fixture`,
      'tuturuuu_app_session=app-fixture',
      'tuturuuu_app_session_refresh=app-refresh-fixture',
      'tuturuuu_web_app_session=web-fixture',
      'tuturuuu_web_account_device=device-fixture',
      'ttr_mfa_mobile_approval=mfa-fixture',
      '__Host-sso-state=sso-fixture',
      'sidebar_state=true',
      'finance-confidential-mode=true',
    ].join('; ');
    const cookies = cookieMap(isolateMountedCookieHeader(header, config));
    expect([...cookies.keys()].sort()).toEqual(
      ['NEXT_LOCALE', '__Host-tuturuuu_app_signed_out', KEY].sort()
    );
    expect(decode(cookies.get(KEY) as string).refresh_token).toBe('');
    const serialized = [...cookies.values()].join(';');
    for (const secret of [
      'refresh-fixture',
      'pkce-fixture',
      'app-fixture',
      'web-fixture',
      'device-fixture',
      'mfa-fixture',
      'sso-fixture',
    ])
      expect(serialized).not.toContain(secret);
  });

  it('joins chunked sessions in order and re-emits one cookie', () => {
    const value = encode(SESSION);
    const header = [
      `${KEY}.1=${value.slice(40)}`,
      `${KEY}.0=${value.slice(0, 40)}`,
    ].join('; ');
    const cookies = cookieMap(isolateMountedCookieHeader(header, config));
    expect([...cookies.keys()]).toEqual([KEY]);
    expect(decode(cookies.get(KEY) as string).access_token).toBe(
      'access.fixture.jwt'
    );
  });

  it('withholds a chunked session with a missing first chunk', () => {
    const value = encode(SESSION);
    expect(
      isolateMountedCookieHeader(`${KEY}.1=${value.slice(40)}`, config)
    ).toBeNull();
  });

  it('returns null when nothing is kept', () => {
    expect(
      isolateMountedCookieHeader('tuturuuu_app_session=x; a=b', config)
    ).toBeNull();
    expect(isolateMountedCookieHeader(null, config)).toBeNull();
  });
  it("keeps the mount's own locale over Web's Path=/ copy", () => {
    // Browsers list the more specific Path=<base> cookie first.
    expect(
      isolateMountedCookieHeader('NEXT_LOCALE=vi; NEXT_LOCALE=en', config)
    ).toBe('NEXT_LOCALE=vi');
  });
});

describe('reduceMountedSessionCookieHeader', () => {
  it("keeps the mount's own locale over Web's Path=/ copy", () => {
    expect(
      reduceMountedSessionCookieHeader('a=1; NEXT_LOCALE=vi; NEXT_LOCALE=en')
    ).toBe('a=1; NEXT_LOCALE=vi');
  });
});

describe('keepFirstLocaleCookie', () => {
  it('drops every later locale copy and keeps other cookies', () => {
    expect(
      keepFirstLocaleCookie('NEXT_LOCALE=vi; a=1; NEXT_LOCALE=en; NEXT_LOCALEx')
    ).toBe('NEXT_LOCALE=vi; a=1; NEXT_LOCALEx');
    expect(keepFirstLocaleCookie(null)).toBeNull();
  });
});

describe('scopeMountedResponseCookies', () => {
  it('drops unowned writes and deletions and scopes owned cookies', () => {
    const response = new Response('x', { status: 302 });
    for (const value of [
      'NEXT_LOCALE=vi; Path=/; Domain=.tuturuuu.com; Max-Age=31536000; SameSite=lax',
      `${KEY}=new; Path=/; Domain=.tuturuuu.com; Max-Age=34560000; SameSite=lax; Secure`,
      `${KEY}.0=; Path=/; Max-Age=0`,
      'tuturuuu_app_session=; Path=/; Max-Age=0; HttpOnly',
      '__Host-tuturuuu_app_signed_out=; Path=/; Max-Age=0; HttpOnly; Secure',
      'sidebar_state=true; Path=/',
    ])
      response.headers.append('set-cookie', value);
    const result = scopeMountedResponseCookies(response, '/hive', config);
    expect(result.status).toBe(302);
    expect(result.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=vi; Max-Age=31536000; SameSite=lax; Path=/hive; Secure',
    ]);
  });

  it('returns the same response without Set-Cookie', () => {
    const response = new Response('x');
    expect(scopeMountedResponseCookies(response, '/hive', config)).toBe(
      response
    );
  });

  it('rewrites Path and Domain case-insensitively', () => {
    expect(
      scopeOwnedSetCookie(
        'NEXT_LOCALE=en; path=/x; DOMAIN=tuturuuu.com; secure; HttpOnly',
        '/hive'
      )
    ).toBe('NEXT_LOCALE=en; HttpOnly; Path=/hive; Secure');
  });
});

describe('assertMountIsolationConfig', () => {
  it.each([
    '__Host-x',
    KEY,
    `${KEY}.0`,
    '__Host-tuturuuu_app_signed_out',
    'bad name',
    '',
  ])('refuses %s as an owned cookie', (name) => {
    expect(() =>
      assertMountIsolationConfig({ ownedCookies: [name] })
    ).toThrow();
  });

  it('accepts ordinary names', () => {
    expect(() => assertMountIsolationConfig(config)).not.toThrow();
  });
});

describe('activation isolation fences', () => {
  it('passes central logout deletions only on the admitted logout response', () => {
    const response = new Response(null);
    const deletions = [
      KEY,
      `${KEY}.0`,
      'ttr_mfa_mobile_approval',
      '__Host-tuturuuu_app_signed_out',
    ].map((name) => `${name}=; Path=/; Max-Age=0; Secure`);
    for (const cookie of deletions)
      response.headers.append('set-cookie', cookie);
    response.headers.append('set-cookie', `${KEY}=live; Path=/; Max-Age=0`);
    response.headers.append('set-cookie', 'ttr_mfa_mobile_approval=; Path=/');
    response.headers.append('set-cookie', 'tuturuuu_app_session=; Max-Age=0');
    expect(
      scopeMountedResponseCookies(
        response.clone(),
        '/hive',
        config,
        true
      ).headers.getSetCookie()
    ).toEqual(deletions);
    expect(
      scopeMountedResponseCookies(
        response,
        '/hive',
        config
      ).headers.getSetCookie()
    ).toEqual([]);
  });

  it('strips origin-wide recovery storage clearing even without cookies', () => {
    const response = scopeMountedResponseCookies(
      new Response(null, { headers: { 'Clear-Site-Data': '"storage"' } }),
      '/hive',
      config
    );
    expect(response.headers.get('clear-site-data')).toBeNull();
  });

  it.each([
    'tuturuuu_app_session',
    'tuturuuu_app_session_refresh',
    'tuturuuu_web_account_device',
    'ttr_mfa_mobile_approval',
    '__Secure-tuturuuu_app_session.0',
  ])('rejects central cookie ownership: %s', (name) => {
    expect(() =>
      assertMountIsolationConfig({ ownedCookies: [name] })
    ).toThrow();
  });
});
