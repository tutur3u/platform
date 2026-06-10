import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeviceCookieValue,
  decryptSession,
  encryptSession,
  parseDeviceCookieValue,
  resolveMultiAccountSecret,
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
});
