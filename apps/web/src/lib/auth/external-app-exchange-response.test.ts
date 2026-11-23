import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRefreshFamily } from '@/lib/app-coordination/refresh-family';
import { verifyAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  createExchangeTokenBody,
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

function issue(
  overrides: Partial<Parameters<typeof createExchangeTokenBody>[0]>
) {
  return createExchangeTokenBody({
    email: 'member@example.com',
    mfa: null,
    policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
    scopes: ['external-projects:read'],
    targetApp: 'fysh',
    userId: 'user-1',
    userProfile,
    ...overrides,
  });
}

describe('external app bearer lifetime', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the policy lifetime when the app has no cap', () => {
    const policy = {
      externalAppBearerTtlSeconds: 28_800,
      internalAppRefreshEarlySeconds: 900,
    };
    expect(getExternalAppBearerLifetime(policy)).toEqual({
      refreshEarlySeconds: 900,
      ttlSeconds: 28_800,
    });
    expect(getExternalAppBearerLifetime(policy, null)).toEqual({
      refreshEarlySeconds: 900,
      ttlSeconds: 28_800,
    });
  });

  it('applies an app cap and scales the refresh margin with it', () => {
    expect(
      getExternalAppBearerLifetime(
        {
          externalAppBearerTtlSeconds: 86_400,
          internalAppRefreshEarlySeconds: 900,
        },
        900
      )
    ).toEqual({ refreshEarlySeconds: 300, ttlSeconds: 900 });
    // A policy shorter than the cap still wins.
    expect(
      getExternalAppBearerLifetime(
        {
          externalAppBearerTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 60,
        },
        900
      )
    ).toEqual({ refreshEarlySeconds: 60, ttlSeconds: 600 });
  });

  it('issues capped bearers while the refresh token keeps the policy lifetime', () => {
    const body = issue({ maxBearerTtlSeconds: 900 });

    expect(body.expiresIn).toBe(900);
    expect(body.refreshEarlySeconds).toBe(300);
    expect(body.refreshExpiresIn).toBe(
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshTtlSeconds
    );
  });

  it('issues uncapped bearers for apps without a cap', () => {
    const body = issue({});

    expect(body.expiresIn).toBe(
      DEFAULT_APP_COORDINATION_SESSION_POLICY.externalAppBearerTtlSeconds
    );
    expect(body.refreshEarlySeconds).toBe(
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshEarlySeconds
    );
  });

  it('signs the issuance workspace into both access and refresh bearers', () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const body = issue({ normalizedWorkspaceId: workspaceId });
    for (const token of [body.accessToken, body.refreshToken]) {
      expect(verifyAppCoordinationToken(token)).toMatchObject({
        ok: true,
        claims: { workspace_id: workspaceId },
      });
    }
  });

  it('starts a refresh family or carries the presented one', () => {
    const family = '0b9f3c62-1d4e-4a8b-9c3f-5e6d7a8b9c0d';
    const read = (token: string) => {
      const verification = verifyAppCoordinationToken(token);
      return verification.ok
        ? readRefreshFamily(verification.claims.scopes)
        : null;
    };

    expect(read(issue({ refreshFamily: family }).refreshToken)).toBe(family);
    const fresh = read(issue({}).refreshToken);
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/u);
    expect(fresh).not.toBe(family);
  });
});

describe('link-only exchanges', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('issues no refresh token and a bearer of at most 120 seconds', () => {
    const body = issue({
      maxBearerTtlSeconds: 900,
      scopes: ['upskii-link:write'],
      targetApp: 'upskii',
    });
    expect(body).not.toHaveProperty('refreshToken');
    expect(body).not.toHaveProperty('refreshExpiresAt');
    expect(body.expiresIn).toBeLessThanOrEqual(120);
    expect(body.refreshEarlySeconds).toBe(0);
  });

  it('narrows a mixed grant to the link scope', () => {
    const body = issue({
      scopes: ['upskii-link:write', 'users:profile:read'],
      targetApp: 'upskii',
    });
    const verified = verifyAppCoordinationToken(body.accessToken);
    expect(body.scopes).toEqual(['upskii-link:write']);
    expect(verified.ok && verified.claims.scopes).toEqual([
      'upskii-link:write',
    ]);
  });

  it('keeps refresh tokens for every other grant', () => {
    expect(issue({})).toHaveProperty('refreshToken');
  });
});
