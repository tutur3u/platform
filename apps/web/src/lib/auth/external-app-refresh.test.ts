import { randomUUID } from 'node:crypto';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(async () => ({
    get: mocks.get,
    set: mocks.set,
  })),
  hasUpstashRestEnv: vi.fn(() => true),
}));

import {
  isNonProductionDeployment,
  verifyExternalAppRefreshToken,
} from './external-app-refresh';

const appServerIp = '203.0.113.7';
const app = {
  allowedWorkspaceIds: [],
  enabled: true,
  id: 'fysh',
  secretIssuedAt: null,
};
// Tokens here carry no workspace, so the grant check reads nothing.
const admin = {} as TypedSupabaseClient;

function token(scopes: string[], userId = randomUUID()) {
  return createAppCoordinationToken(
    {
      expiresInSeconds: 86_400,
      scopes,
      targetApp: 'fysh',
      userId,
    },
    { secret: 'test-secret' }
  ).token;
}

function verify(refreshToken: string) {
  return verifyExternalAppRefreshToken({
    admin,
    app,
    familyTtlSeconds: 2_592_000,
    ip: appServerIp,
    refreshToken,
    replayGraceSeconds: 30,
    targetApp: 'fysh',
  });
}

describe('external app refresh rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue('OK');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('does not limit one app server refreshing many families from one IP', async () => {
    const results = [];
    for (let index = 0; index < 75; index += 1) {
      results.push(
        await verify(
          token(['app-token:refresh', `app-token:family:${randomUUID()}`])
        )
      );
    }

    expect(results.filter((result) => result === 'limited')).toEqual([]);
    expect(
      results.every((result) => result && typeof result === 'object')
    ).toBe(true);
  });

  it('still limits a single family that refreshes too fast', async () => {
    const family = randomUUID();
    const userId = randomUUID();
    const results = [];
    for (let index = 0; index < 21; index += 1) {
      results.push(
        await verify(
          token(['app-token:refresh', `app-token:family:${family}`], userId)
        )
      );
    }

    expect(results.indexOf('limited')).toBe(20);
  });

  it('returns the family of the presented token', async () => {
    const family = randomUUID();

    const result = await verify(
      token(['app-token:refresh', `app-token:family:${family}`])
    );

    expect(result).toMatchObject({ family });
  });

  it('refuses tokens for another app or without the refresh scope', async () => {
    expect(await verify(token(['external-projects:*']))).toBeNull();
    expect(
      await verifyExternalAppRefreshToken({
        admin,
        app,
        familyTtlSeconds: 60,
        ip: appServerIp,
        refreshToken: token(['app-token:refresh']),
        replayGraceSeconds: 30,
        targetApp: 'other-app',
      })
    ).toBeNull();
  });
});

describe('isNonProductionDeployment', () => {
  it('treats production markers and unmarked production builds as production', () => {
    expect(isNonProductionDeployment({ VERCEL_ENV: 'production' })).toBe(false);
    expect(
      isNonProductionDeployment({ TUTURUUU_DEPLOY_ENV: 'Production' })
    ).toBe(false);
    expect(isNonProductionDeployment({ NODE_ENV: 'production' })).toBe(false);
    expect(isNonProductionDeployment({})).toBe(false);
    expect(isNonProductionDeployment({ VERCEL_ENV: 'prod' })).toBe(false);
    expect(
      isNonProductionDeployment({ NODE_ENV: 'test', VERCEL_ENV: 'canary' })
    ).toBe(false);
    expect(
      isNonProductionDeployment({
        TUTURUUU_DEPLOY_ENV: 'production',
        VERCEL_ENV: 'preview',
      })
    ).toBe(false);
  });

  it('exempts preview, staging, development and test runtimes', () => {
    expect(
      isNonProductionDeployment({
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
      })
    ).toBe(true);
    expect(isNonProductionDeployment({ TUTURUUU_DEPLOY_ENV: 'staging' })).toBe(
      true
    );
    expect(isNonProductionDeployment({ NODE_ENV: 'development' })).toBe(true);
    expect(isNonProductionDeployment({ NODE_ENV: 'test' })).toBe(true);
  });
});
