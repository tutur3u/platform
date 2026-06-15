import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceCookieValue,
  decryptSession,
  encryptSession,
  getDeviceCookieName,
  getDeviceCookieOptions,
  getLegacyDeviceCookieClearOptions,
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

  it('uses a host-prefixed device cookie on HTTPS requests', () => {
    const request = new Request('http://internal.localhost/login', {
      headers: {
        'x-forwarded-host': 'app.tuturuuu.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(getDeviceCookieName(request)).toBe(WEB_ACCOUNT_DEVICE_COOKIE_NAME);
    expect(getDeviceCookieOptions(request)).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    expect(getDeviceCookieOptions(request)).not.toHaveProperty('domain');
  });

  it('keeps HTTP development cookies host-only without the host prefix', () => {
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
    expect(getDeviceCookieOptions(request)).not.toHaveProperty('domain');
  });

  it('falls back to a non-secure cookie for HTTPS localhost dev/E2E hosts', () => {
    // portless serves local dev and E2E over HTTPS with an untrusted cert, so
    // Chromium drops Secure/__Host- cookies. Localhost-style hosts must use the
    // legacy non-secure device cookie even when the resolved protocol is HTTPS.
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
    expect(getDeviceCookieOptions(request)).not.toHaveProperty('domain');
  });

  it('expires legacy parent-domain cookies without reusing that scope', () => {
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
});
