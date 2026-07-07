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

describe('web multi-account crypto', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_SECRET_KEY: 'supabase-secret',
      WEB_MULTI_ACCOUNT_SESSION_SECRET: 'web-secret',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the dedicated web multi-account secret before Supabase service keys', () => {
    expect(
      resolveMultiAccountSecret({
        SUPABASE_SECRET_KEY: 'supabase-secret',
        SUPABASE_SERVICE_KEY: 'service-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        WEB_MULTI_ACCOUNT_SESSION_SECRET: 'web-secret',
      })
    ).toBe('web-secret');
  });

  it('falls back through Supabase service secrets when the dedicated secret is missing', () => {
    expect(
      resolveMultiAccountSecret({
        SUPABASE_SECRET_KEY: 'supabase-secret',
        SUPABASE_SERVICE_KEY: 'service-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      })
    ).toBe('supabase-secret');
    expect(
      resolveMultiAccountSecret({
        SUPABASE_SERVICE_KEY: 'service-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      })
    ).toBe('service-role-key');
    expect(
      resolveMultiAccountSecret({
        SUPABASE_SERVICE_KEY: 'service-key',
      })
    ).toBe('service-key');
  });

  it('round-trips sessions without storing raw refresh tokens in the ciphertext', () => {
    const encrypted = encryptSession(session);

    expect(encrypted).not.toContain(session.refresh_token);
    expect(decryptSession(encrypted)).toMatchObject({
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
    // still needs the shared cookie name/scope, but without Secure.
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
