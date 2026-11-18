import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExchangeTokenBody,
  EXTERNAL_APP_BEARER_MAX_TTL_SECONDS,
  getExternalAppBearerLifetime,
} from './external-app-exchange-response';

const userProfile = {
  avatarUrl: null,
  avatar_url: null,
  displayName: null,
  display_name: null,
  email: 'member@example.com',
  fullName: null,
  full_name: null,
  id: 'user-1',
  name: null,
};

describe('external app bearer lifetime', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('caps the bearer at fifteen minutes whatever the policy allows', () => {
    expect(EXTERNAL_APP_BEARER_MAX_TTL_SECONDS).toBe(900);
    expect(
      getExternalAppBearerLifetime({
        externalAppBearerTtlSeconds: 86_400,
        internalAppRefreshEarlySeconds: 900,
      })
    ).toEqual({ refreshEarlySeconds: 300, ttlSeconds: 900 });
  });

  it('keeps a shorter policy lifetime and a smaller refresh margin', () => {
    expect(
      getExternalAppBearerLifetime({
        externalAppBearerTtlSeconds: 600,
        internalAppRefreshEarlySeconds: 60,
      })
    ).toEqual({ refreshEarlySeconds: 60, ttlSeconds: 600 });
  });

  it('issues capped bearers while the refresh token keeps the policy lifetime', () => {
    const body = createExchangeTokenBody({
      email: 'member@example.com',
      mfa: null,
      policy: {
        ...DEFAULT_APP_COORDINATION_SESSION_POLICY,
        externalAppBearerTtlSeconds: 28_800,
      },
      scopes: ['external-projects:read'],
      targetApp: 'fysh',
      userId: 'user-1',
      userProfile,
    });

    expect(body.expiresIn).toBe(900);
    expect(body.refreshEarlySeconds).toBeLessThan(body.expiresIn);
    expect(body.refreshExpiresIn).toBe(
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshTtlSeconds
    );
  });
});
