import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createExchangeRequest,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

const family = '0b9f3c62-1d4e-4a8b-9c3f-5e6d7a8b9c0d';

function refreshTokenFor(scopes: string[]) {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 86_400,
      originApp: 'web',
      scopes,
      targetApp: 'yoola',
      userId: victimUserId,
    },
    { secret: 'test-secret' }
  ).token;
}

function refresh(token: string) {
  return POST(
    createExchangeRequest({
      appId: 'yoola',
      appSecret: 'ttr_app_secret_test',
      refreshToken: token,
      requestedScopes: ['external-projects:*'],
      workspaceId,
    })
  );
}

function optIn(maxBearerTtlSeconds: number | null) {
  mocks.verifyExternalAppSecret.mockResolvedValue({
    app: {
      allowedScopes: ['external-projects:*'],
      allowedWorkspaceIds: [],
      callbackPaths: [],
      createdAt: null,
      createdBy: null,
      displayName: 'yoola',
      enabled: true,
      id: 'yoola',
      maxBearerTtlSeconds,
      origins: ['https://yoola.example.com'],
      requirePkce: false,
      secretIssuedAt: null,
      secretLastFour: 'test',
      updatedAt: null,
      updatedBy: null,
    },
    ok: true,
  });
}

type RefreshBody = {
  accessToken: string;
  expiresIn: number;
  refreshEarlySeconds: number;
  refreshToken: string;
};

describe('external app refresh lifetimes and families', () => {
  registerExchangeTestSetup();
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('caps a refreshed bearer for an app that opted in', async () => {
    optIn(900);

    const response = await refresh(refreshTokenFor(['app-token:refresh']));

    expect(response.status).toBe(200);
    const body = (await response.json()) as RefreshBody;
    expect(body.expiresIn).toBe(900);
    expect(body.refreshEarlySeconds).toBe(300);
    const access = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });
    expect(access.ok && access.claims.exp - access.claims.iat).toBe(900);
  });

  it('keeps the policy lifetime for an app without a cap', async () => {
    optIn(null);

    const response = await refresh(refreshTokenFor(['app-token:refresh']));

    expect(response.status).toBe(200);
    const body = (await response.json()) as RefreshBody;
    expect(body.expiresIn).toBe(
      DEFAULT_APP_COORDINATION_SESSION_POLICY.externalAppBearerTtlSeconds
    );
    expect(body.refreshEarlySeconds).toBe(
      DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshEarlySeconds
    );
  });

  it('carries the rotation family into the next refresh token', async () => {
    optIn(900);

    const response = await refresh(
      refreshTokenFor(['app-token:refresh', `app-token:family:${family}`])
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as RefreshBody;
    const next = verifyAppCoordinationToken(body.refreshToken, {
      secret: 'test-secret',
    });
    expect(next.ok && next.claims.scopes).toEqual([
      'app-token:refresh',
      `app-token:family:${family}`,
    ]);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    optIn(900);
    const familyKey = `app-token:refresh:family-revoked:yoola:${family}`;
    const revoked = new Set<string>();
    mocks.redisSet.mockImplementation(async (key: string) => {
      if (key === familyKey) revoked.add(key);
      return 'OK';
    });
    // The presented token was first used an hour ago: outside the grace.
    mocks.redisGet.mockImplementation(async (key: string) =>
      key === familyKey
        ? revoked.has(key)
          ? '1'
          : null
        : Math.floor(Date.now() / 1000) - 3600
    );

    const reused = await refresh(
      refreshTokenFor(['app-token:refresh', `app-token:family:${family}`])
    );
    expect(reused.status).toBe(401);
    expect(mocks.redisSet).toHaveBeenCalledWith(familyKey, expect.any(String), {
      ex: DEFAULT_APP_COORDINATION_SESSION_POLICY.internalAppRefreshTtlSeconds,
    });

    // The legitimate successor of the same family is refused from now on.
    mocks.redisSet.mockClear();
    const successor = await refresh(
      refreshTokenFor(['app-token:refresh', `app-token:family:${family}`])
    );
    expect(successor.status).toBe(401);
    await expect(successor.json()).resolves.toEqual({
      error: 'Invalid or expired refresh token',
    });
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });
});
