import './route-test-support';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

const limiter = vi.hoisted(() => ({
  limitExternalAppTokenExchange: vi.fn(),
}));

vi.mock('@/lib/external-apps/rate-limit', () => limiter);

function exchange(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/v1/auth/app-token/exchange', {
      body: JSON.stringify({
        appId: 'yoola',
        appSecret: 'ttr_app_secret_test',
        requestedScopes: ['external-projects:read'],
        workspaceId,
        ...body,
      }),
      headers: { 'cf-connecting-ip': '203.0.113.7' },
      method: 'POST',
    })
  );
}

describe('app token exchange rate limit', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare');
    mockRegisteredApp();
    limiter.limitExternalAppTokenExchange.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('counts a token exchange once per app and trusted client IP', async () => {
    const response = await exchange({ token: 'handoff-token' });

    expect(response.status).toBe(200);
    expect(limiter.limitExternalAppTokenExchange).toHaveBeenCalledTimes(1);
    expect(limiter.limitExternalAppTokenExchange).toHaveBeenCalledWith({
      appId: 'yoola',
      ip: '203.0.113.7',
    });
  });

  it.each([
    [429, 'RATE_LIMIT_EXCEEDED'],
    [503, 'RATE_LIMIT_UNAVAILABLE'],
  ])(
    'returns a %i refusal before checking the app secret',
    async (status, code) => {
      limiter.limitExternalAppTokenExchange.mockResolvedValue(
        NextResponse.json({ code }, { status })
      );

      const response = await exchange({ token: 'handoff-token' });

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ code });
      expect(mocks.verifyExternalAppSecret).not.toHaveBeenCalled();
    }
  );

  it('leaves refresh to its own limiter', async () => {
    const refreshToken = createAppCoordinationToken(
      {
        email: 'victim@example.com',
        expiresInSeconds: 86_400,
        originApp: 'web',
        scopes: ['app-token:refresh'],
        targetApp: 'yoola',
        userId: victimUserId,
        workspaceId,
      },
      { secret: 'test-secret' }
    ).token;

    await exchange({ refreshToken });

    expect(limiter.limitExternalAppTokenExchange).not.toHaveBeenCalled();
  });
});
