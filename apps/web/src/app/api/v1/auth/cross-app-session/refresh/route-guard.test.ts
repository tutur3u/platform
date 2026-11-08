// Keep request logging outside this route unit test's provider boundary.
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (<T extends Response>(
    _options: Parameters<
      typeof import('@/lib/infrastructure/log-drain').withRequestLogDrain
    >[0],
    handler: () => Promise<T>
  ) =>
    handler()) satisfies typeof import('@/lib/infrastructure/log-drain').withRequestLogDrain,
}));

import { createAppSessionTokenPair } from '@tuturuuu/auth/app-session';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getAppCoordinationSessionPolicy: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));

vi.mock('@/lib/app-coordination/session-policy', () => ({
  getAppCoordinationSessionPolicy: (...args: unknown[]): Promise<unknown> =>
    mocks.getAppCoordinationSessionPolicy(...args),
}));

function refresh(refreshToken: string) {
  return POST(
    new NextRequest(
      'https://tuturuuu.localhost/api/v1/auth/cross-app-session/refresh',
      {
        body: JSON.stringify({ refreshToken, targetApp: 'learn' }),
        method: 'POST',
      }
    )
  );
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('cross-app refresh replay guards with the store assigned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    // Assigned with no usable configuration: the routes' store is mocked.
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    mocks.getAppCoordinationSessionPolicy.mockResolvedValue({
      policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
      source: 'default',
    });
    mocks.createAdminClient.mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: 'agent@example.com', id: 'user-1' } },
            error: null,
          }),
        },
      },
    });
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue('OK');
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      get: mocks.redisGet,
      set: mocks.redisSet,
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies grace after losing a concurrent claim, and on retry', async () => {
    const token = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    }).refresh.token;
    // Both requests read absence; this one loses SET NX to the winner.
    mocks.redisGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(nowSeconds());
    mocks.redisSet.mockResolvedValueOnce(null);
    expect((await refresh(token)).status).toBe(200);

    // A legitimate retry inside grace is not poisoned by a cached replay.
    mocks.redisGet.mockResolvedValueOnce(nowSeconds());
    expect((await refresh(token)).status).toBe(200);
  });

  it('caches only replays proven outside grace', async () => {
    const token = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    }).refresh.token;
    mocks.redisGet.mockResolvedValue(nowSeconds() - 3600);
    expect((await refresh(token)).status).toBe(401);
    expect((await refresh(token)).status).toBe(401);
    // The repeat was answered from memory.
    expect(mocks.redisGet).toHaveBeenCalledTimes(1);
  });

  it('pre-limits one principal before spending store operations', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 22; attempt += 1) {
      const token = createAppSessionTokenPair({
        targetApp: 'learn',
        userId: 'flood-user',
      }).refresh.token;
      statuses.push((await refresh(token)).status);
    }
    expect(statuses.indexOf(429)).toBe(20);
    expect(mocks.redisSet).toHaveBeenCalledTimes(20);
    // Denied attempts never read the store: 20 admitted attempts, 20 GETs.
    expect(mocks.redisGet).toHaveBeenCalledTimes(20);
  });
});
