import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  user: vi.fn(),
  profile: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_SCOPE: 'app-session',
  getAppSessionClaimsFromRequest: mocks.claims,
  getAppSessionUserFromRequest: mocks.user,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: mocks.profile,
  withForwardedInternalApiAuth: mocks.forward,
}));

import {
  getSatelliteAppSessionFromRequest,
  getSatelliteAppSessionUserFromRequest,
  getSatelliteCurrentUserFromRequest,
} from './auth-request';

const claims = {
  aud: 'tuturuuu-api',
  email: 'synthetic@example.com',
  exp: 1_800_000_000,
  iat: 1_700_000_000,
  iss: 'tuturuuu',
  jti: 'synthetic-session',
  origin_app: 'web',
  scopes: ['app-session'],
  sub: 'synthetic-user',
  target_app: 'tools',
  typ: 'app_coordination',
} satisfies AppCoordinationTokenClaims;

function context() {
  return {
    request: new Request('https://tools.example.com', {
      headers: { authorization: 'Bearer synthetic-session' },
    }),
    targetApp: 'tools' as const,
    getSupabaseSessionUser: vi.fn().mockResolvedValue(null),
  };
}

describe('request-scoped satellite authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.claims.mockReturnValue(null);
    mocks.user.mockReturnValue(null);
    mocks.forward.mockImplementation((headers: Headers) => ({ headers }));
  });

  it('passes the explicit request and target to the claims verifier', async () => {
    const options = context();
    mocks.claims.mockReturnValue(claims);
    await expect(getSatelliteAppSessionFromRequest(options)).resolves.toBe(
      claims
    );
    expect(mocks.claims).toHaveBeenCalledWith(
      { headers: options.request.headers },
      { targetApp: 'tools' }
    );
    expect(options.getSupabaseSessionUser).not.toHaveBeenCalled();
  });

  it('returns the verified app user without consulting the fallback', async () => {
    const options = context();
    const user = { id: claims.sub };
    mocks.user.mockReturnValue(user);
    await expect(getSatelliteAppSessionUserFromRequest(options)).resolves.toBe(
      user
    );
    expect(mocks.user).toHaveBeenCalledWith(
      { headers: options.request.headers },
      { targetApp: 'tools' }
    );
    expect(options.getSupabaseSessionUser).not.toHaveBeenCalled();
  });

  it('does not manufacture an actor when verification and fallback reject', async () => {
    const options = context();
    await expect(
      getSatelliteAppSessionFromRequest(options)
    ).resolves.toBeNull();
    await expect(
      getSatelliteAppSessionUserFromRequest(options)
    ).resolves.toBeNull();
    await expect(
      getSatelliteCurrentUserFromRequest(options)
    ).resolves.toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it('retains a verified app actor when the profile service is unavailable', async () => {
    mocks.claims.mockReturnValue(claims);
    mocks.profile.mockRejectedValue(new Error('synthetic outage'));
    const options = context();
    await expect(getSatelliteCurrentUserFromRequest(options)).resolves.toEqual({
      id: claims.sub,
      email: claims.email,
    });
    expect(mocks.forward).toHaveBeenCalledWith(options.request.headers);
  });

  it('keeps interleaved request headers separate at the profile boundary', async () => {
    mocks.claims.mockReturnValue(claims);
    mocks.profile.mockImplementation(
      async ({ headers }: { headers: Headers }) => {
        await Promise.resolve();
        return { id: headers.get('x-synthetic-actor') };
      }
    );
    const first = context();
    const second = context();
    first.request.headers.set('x-synthetic-actor', 'first');
    second.request.headers.set('x-synthetic-actor', 'second');
    const [a, b] = await Promise.all([
      getSatelliteCurrentUserFromRequest(first),
      getSatelliteCurrentUserFromRequest(second),
    ]);
    expect(a?.id).toBe('first');
    expect(b?.id).toBe('second');
  });
});
