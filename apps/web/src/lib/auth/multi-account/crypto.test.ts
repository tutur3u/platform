import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceCookieValue,
  decryptSession,
  encryptSession,
  getAllDeviceCookieClearTargets,
  getDeviceCookieName,
  getDeviceCookieOptions,
  getDeviceCookieReadNames,
  getLegacyDeviceCookieClearOptions,
  getStaleDeviceCookieClearTargets,
  LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
  parseDeviceCookieValue,
  resolveMultiAccountSecret,
  WEB_ACCOUNT_DEVICE_COOKIE_NAME,
} from './crypto';

const ORIGINAL_ENV = { ...process.env };
const DEDICATED_SECRET = 'test-vault-secret-'.repeat(2);

const session = {
  access_token: 'access-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  user: {
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-06-10T00:00:00.000Z',
    email: 'local@tuturuuu.com',
    id: '00000000-0000-0000-0000-000000000001',
    user_metadata: {
      full_name: 'Local User',
    },
  },
} satisfies SupabaseSession;

describe('web multi-account storage size', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_SECRET_KEY: 'supabase-secret',
      WEB_MULTI_ACCOUNT_SESSION_SECRET: DEDICATED_SECRET,
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('keeps the device cookie small while ten synthetic sessions exceed 4KB only if packed together', () => {
    const filler = 'synthetic-filler'.repeat(40);
    const ciphertexts = Array.from({ length: 10 }, (_, index) =>
      encryptSession({
        ...session,
        access_token: `synthetic-access-${index}-${filler}`,
        refresh_token: `synthetic-refresh-${index}-${filler}`,
        user: {
          ...session.user,
          id: `00000000-0000-0000-0000-00000000000${index}`,
        },
      })
    );
    const cookie = createDeviceCookieValue(
      '11111111-1111-1111-1111-111111111111',
      'synthetic-device-secret'
    );

    expect(cookie.length).toBeLessThan(500);
    expect(cookie).not.toContain('synthetic-access');
    expect(ciphertexts.join('').length).toBeGreaterThan(4096);
    for (const ciphertext of ciphertexts) {
      expect(ciphertext).not.toContain('synthetic-access');
      expect(ciphertext.startsWith('v2.')).toBe(true);
    }
  });
});

describe('web multi-account crypto', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_SECRET_KEY: 'supabase-secret',
      WEB_MULTI_ACCOUNT_SESSION_SECRET: DEDICATED_SECRET,
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the dedicated web multi-account secret when Supabase service keys are present', () => {
    expect(
      resolveMultiAccountSecret({
        SUPABASE_SECRET_KEY: 'supabase-secret',
        SUPABASE_SERVICE_KEY: 'service-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        WEB_MULTI_ACCOUNT_SESSION_SECRET: DEDICATED_SECRET,
      })
    ).toBe(DEDICATED_SECRET);
  });

  it.each([undefined, '', 'a'.repeat(31)])(
    'rejects a missing or short dedicated secret (%s) even if service keys exist',
    (value) => {
      if (value === undefined)
        delete process.env.WEB_MULTI_ACCOUNT_SESSION_SECRET;
      else process.env.WEB_MULTI_ACCOUNT_SESSION_SECRET = value;
      process.env.SUPABASE_SECRET_KEY = 'service-fixture-'.repeat(3);

      expect(resolveMultiAccountSecret()).toBeNull();
      expect(() => encryptSession(session)).toThrow(
        'WEB_MULTI_ACCOUNT_SESSION_SECRET is required and must be at least 32 bytes'
      );
    }
  );

  it('enforces the minimum using UTF-8 bytes', () => {
    const secret = 'é'.repeat(16);
    expect(
      resolveMultiAccountSecret({ WEB_MULTI_ACCOUNT_SESSION_SECRET: secret })
    ).toBe(secret);
    expect(
      resolveMultiAccountSecret({
        WEB_MULTI_ACCOUNT_SESSION_SECRET: 'é'.repeat(15),
      })
    ).toBeNull();
  });

  it('treats legacy versions, corrupt ciphertext and a different account as absent', () => {
    const ciphertext = encryptSession(session);
    const [version, iv, , encrypted] = ciphertext.split('.');
    expect(
      decryptSession(ciphertext.replace(/^v2\./u, 'v1.'), session.user.id)
    ).toBeNull();
    expect(
      decryptSession(
        `${version}.${iv}.aW52YWxpZA.${encrypted}`,
        session.user.id
      )
    ).toBeNull();
    expect(decryptSession(ciphertext, 'different-user')).toBeNull();
    process.env.WEB_MULTI_ACCOUNT_SESSION_SECRET = 'different-test-key-'.repeat(
      2
    );
    expect(decryptSession(ciphertext, session.user.id)).toBeNull();
  });

  it('round-trips sessions without storing raw refresh tokens in the ciphertext', () => {
    const encrypted = encryptSession(session);

    expect(encrypted).not.toContain(session.refresh_token);
    expect(decryptSession(encrypted, session.user.id)).toMatchObject({
      refresh_token: session.refresh_token,
      user: {
        email: 'local@tuturuuu.com',
        id: '00000000-0000-0000-0000-000000000001',
      },
    });
  });

  it('rejects tampered device cookies', () => {
    const value = createDeviceCookieValue(
      '00000000-0000-0000-0000-000000000001',
      'device-secret'
    );

    expect(parseDeviceCookieValue(value)).toEqual({
      deviceId: '00000000-0000-0000-0000-000000000001',
      secret: 'device-secret',
    });
    expect(
      parseDeviceCookieValue(value.replace('device-secret', 'other'))
    ).toBe(null);
  });

  it('uses the shared device cookie on first-party HTTPS requests', () => {
    // The forwarded host is honoured because it is a configured origin.
    vi.stubEnv('WEB_APP_URL', 'https://app.tuturuuu.com');
    const request = new Request('http://internal.localhost/login', {
      headers: {
        'x-forwarded-host': 'app.tuturuuu.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(getDeviceCookieName(request)).toBe(
      LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME
    );
    expect(getDeviceCookieReadNames(request)).toEqual([
      LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
      WEB_ACCOUNT_DEVICE_COOKIE_NAME,
    ]);
    expect(getDeviceCookieOptions(request)).toMatchObject({
      domain: '.tuturuuu.com',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  });

  it('shares HTTP development cookies across tuturuuu.localhost subdomains', () => {
    const request = new Request('http://tuturuuu.localhost/login');

    expect(getDeviceCookieName(request)).toBe(
      LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME
    );
    expect(getDeviceCookieOptions(request)).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
    expect(getDeviceCookieOptions(request)).toMatchObject({
      domain: '.tuturuuu.localhost',
    });
  });

  it('keeps custom local development cookies host-only without the host prefix', () => {
    const request = new Request('http://localhost:7803/login');

    expect(getDeviceCookieName(request)).toBe(
      LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME
    );
    expect(getDeviceCookieOptions(request)).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
    expect(getDeviceCookieOptions(request)).not.toHaveProperty('domain');
  });

  it('uses a non-secure shared cookie for HTTPS tuturuuu.localhost dev/E2E hosts', () => {
    // portless serves local dev and E2E over HTTPS with an untrusted cert, so
    // Chromium drops Secure/__Host- cookies. The first-party localhost domain
    // still needs the shared cookie name/scope, but without Secure. portless
    // configures PORTLESS_URL, so the forwarded host is a configured origin.
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost:1355');
    const request = new Request('http://internal.localhost/login', {
      headers: {
        'x-forwarded-host': 'tuturuuu.localhost:1355',
        'x-forwarded-proto': 'https',
      },
    });

    expect(getDeviceCookieName(request)).toBe(
      LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME
    );
    expect(getDeviceCookieOptions(request)).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
    expect(getDeviceCookieOptions(request)).toMatchObject({
      domain: '.tuturuuu.localhost',
    });
  });

  it('keeps host-prefixed cookies for non-shared HTTPS hosts', () => {
    const request = new Request('https://accounts.example.com/login');

    expect(getDeviceCookieName(request)).toBe(WEB_ACCOUNT_DEVICE_COOKIE_NAME);
    expect(getDeviceCookieReadNames(request)).toEqual([
      WEB_ACCOUNT_DEVICE_COOKIE_NAME,
      LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
    ]);
    expect(getDeviceCookieOptions(request)).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    expect(getDeviceCookieOptions(request)).not.toHaveProperty('domain');
  });

  it('expires legacy host-only and parent-domain cookies', () => {
    const request = new Request('https://app.tuturuuu.com/login');

    expect(getLegacyDeviceCookieClearOptions(request)).toEqual([
      expect.objectContaining({
        maxAge: 0,
        path: '/',
        secure: true,
      }),
      expect.objectContaining({
        domain: '.tuturuuu.com',
        maxAge: 0,
        path: '/',
        secure: true,
      }),
    ]);
    expect(getLegacyDeviceCookieClearOptions(request)[0]).not.toHaveProperty(
      'domain'
    );
  });

  it('clears stale host-only duplicates when writing the shared cookie', () => {
    const request = new Request('https://app.tuturuuu.com/login');

    expect(getStaleDeviceCookieClearTargets(request)).toEqual([
      {
        name: LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: expect.objectContaining({
          maxAge: 0,
          path: '/',
          secure: true,
        }),
      },
      {
        name: WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: expect.objectContaining({
          maxAge: 0,
          path: '/',
          secure: true,
        }),
      },
    ]);
    expect(
      getStaleDeviceCookieClearTargets(request)[0]?.options
    ).not.toHaveProperty('domain');
  });

  it('clears active and stale device cookies on shared hosts', () => {
    const request = new Request('https://app.tuturuuu.com/login');

    expect(getAllDeviceCookieClearTargets(request)).toEqual([
      {
        name: LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: expect.objectContaining({
          domain: '.tuturuuu.com',
          maxAge: 0,
        }),
      },
      {
        name: LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: expect.not.objectContaining({
          domain: expect.any(String),
        }),
      },
      {
        name: WEB_ACCOUNT_DEVICE_COOKIE_NAME,
        options: expect.objectContaining({
          maxAge: 0,
          secure: true,
        }),
      },
    ]);
  });
});
