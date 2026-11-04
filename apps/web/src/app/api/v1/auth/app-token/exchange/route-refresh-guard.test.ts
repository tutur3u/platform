import './route-test-support';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

function refreshToken(userId = victimUserId) {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 86_400,
      originApp: 'web',
      scopes: ['app-token:refresh'],
      targetApp: 'yoola',
      userId,
    },
    { secret: 'test-secret' }
  ).token;
}

function exchange(token: string) {
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

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('app token exchange replay guards with the store assigned', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    // Assigned with no usable configuration: the routes' store is mocked.
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    mockRegisteredApp(['external-projects:*']);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies grace after losing a concurrent claim, and on retry', async () => {
    const token = refreshToken();
    // Both requests read absence; this one loses SET NX to the winner.
    mocks.redisGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(nowSeconds());
    mocks.redisSet.mockResolvedValueOnce(null);
    expect((await exchange(token)).status).toBe(200);

    // A legitimate retry inside grace is not poisoned by a cached replay.
    mocks.redisGet.mockResolvedValueOnce(nowSeconds());
    expect((await exchange(token)).status).toBe(200);
  });

  it('caches only replays proven outside grace', async () => {
    const token = refreshToken();
    mocks.redisGet.mockResolvedValue(nowSeconds() - 3600);
    expect((await exchange(token)).status).toBe(401);
    expect((await exchange(token)).status).toBe(401);
    // The repeat was answered from memory.
    expect(mocks.redisGet).toHaveBeenCalledTimes(1);
  });

  it('pre-limits one principal before spending store operations', async () => {
    // A later minute starts a fresh per-instance pre-limit window.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 120_000);
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 22; attempt += 1) {
        statuses.push((await exchange(refreshToken())).status);
      }
      expect(statuses.indexOf(429)).toBe(20);
      expect(mocks.redisSet).toHaveBeenCalledTimes(20);
      // Denied attempts never read the store: 20 admitted attempts, 20 GETs.
      expect(mocks.redisGet).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });
});
