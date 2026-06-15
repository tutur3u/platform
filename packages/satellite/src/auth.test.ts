import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppSessionClaimsFromRequest: vi.fn(),
  getAppSessionUserFromRequest: vi.fn(),
  getSupabaseSessionUser: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_SCOPE: 'app-session',
  getAppSessionClaimsFromRequest: mocks.getAppSessionClaimsFromRequest,
  getAppSessionUserFromRequest: mocks.getAppSessionUserFromRequest,
}));

vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  getSupabaseSessionUser: mocks.getSupabaseSessionUser,
}));

import { getSatelliteAppSession, getSatelliteAppSessionUser } from './auth';

const appSession = {
  aud: 'tuturuuu-api',
  email: 'app@example.com',
  exp: 1_800_000_000,
  iat: 1_700_000_000,
  iss: 'tuturuuu',
  jti: 'app-session',
  origin_app: 'web',
  scopes: ['app-session'],
  sub: 'app-user',
  target_app: 'mail',
  typ: 'app_coordination',
} satisfies AppCoordinationTokenClaims;

const appSessionUser = {
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-06-15T00:00:00.000Z',
  email: 'app@example.com',
  id: 'app-user',
  user_metadata: {},
};

const supabaseUser = {
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-06-15T00:00:00.000Z',
  email: 'supabase@example.com',
  id: 'supabase-user',
  user_metadata: {},
};

describe('satellite auth helpers', () => {
  const requestHeaders = new Headers({ authorization: 'Bearer app-session' });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getAppSessionUserFromRequest.mockReturnValue(null);
    mocks.getSupabaseSessionUser.mockResolvedValue(null);
  });

  it('prefers target-scoped app-session claims over raw Supabase cookies', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(appSession);
    mocks.getSupabaseSessionUser.mockResolvedValue(supabaseUser);

    await expect(getSatelliteAppSession('mail')).resolves.toBe(appSession);

    expect(mocks.getAppSessionClaimsFromRequest).toHaveBeenCalledWith(
      { headers: requestHeaders },
      { targetApp: 'mail' }
    );
    expect(mocks.getSupabaseSessionUser).not.toHaveBeenCalled();
  });

  it('prefers target-scoped app-session users over raw Supabase users', async () => {
    mocks.getAppSessionUserFromRequest.mockReturnValue(appSessionUser);
    mocks.getSupabaseSessionUser.mockResolvedValue(supabaseUser);

    await expect(getSatelliteAppSessionUser('mail')).resolves.toBe(
      appSessionUser
    );

    expect(mocks.getAppSessionUserFromRequest).toHaveBeenCalledWith(
      { headers: requestHeaders },
      { targetApp: 'mail' }
    );
    expect(mocks.getSupabaseSessionUser).not.toHaveBeenCalled();
  });

  it('falls back to a Supabase-backed app-session only when no app-session exists', async () => {
    mocks.getSupabaseSessionUser.mockResolvedValue(supabaseUser);

    await expect(getSatelliteAppSession('mail')).resolves.toMatchObject({
      email: 'supabase@example.com',
      sub: 'supabase-user',
      target_app: 'mail',
    });
  });
});
