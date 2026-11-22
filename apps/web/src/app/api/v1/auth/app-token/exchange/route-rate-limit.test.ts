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
  admitExternalAppExchange: vi.fn(),
  limitVerifiedExternalAppExchange: vi.fn(),
  paceExternalAppExchangeFailure: vi.fn(),
}));

vi.mock('@/lib/external-apps/exchange-rate-limit', () => limiter);

const source = { appId: 'yoola', ip: '203.0.113.7' };

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
      headers: { 'cf-connecting-ip': source.ip },
      method: 'POST',
    })
  );
}

function refreshToken() {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 86_400,
      originApp: 'web',
      scopes: ['app-token:refresh'],
      targetApp: 'other-app',
      userId: victimUserId,
      workspaceId,
    },
    { secret: 'test-secret' }
  ).token;
}

const refusal = (status: number) =>
  NextResponse.json({ code: `refused-${status}` }, { status });

describe('app token exchange rate limit', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare');
    mockRegisteredApp();
    limiter.admitExternalAppExchange.mockResolvedValue(null);
    limiter.limitVerifiedExternalAppExchange.mockResolvedValue(null);
    limiter.paceExternalAppExchangeFailure.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits per app and IP, then counts the verified app once', async () => {
    const response = await exchange({ token: 'handoff-token' });

    expect(response.status).toBe(200);
    expect(limiter.admitExternalAppExchange).toHaveBeenCalledTimes(1);
    expect(limiter.admitExternalAppExchange).toHaveBeenCalledWith(source);
    expect(limiter.limitVerifiedExternalAppExchange).toHaveBeenCalledTimes(1);
    expect(limiter.limitVerifiedExternalAppExchange).toHaveBeenCalledWith(
      'yoola'
    );
    expect(limiter.paceExternalAppExchangeFailure).not.toHaveBeenCalled();
  });

  it.each([429, 503])(
    'returns a %i admission refusal before checking the app secret',
    async (status) => {
      limiter.admitExternalAppExchange.mockResolvedValue(refusal(status));

      const response = await exchange({ token: 'handoff-token' });

      expect(response.status).toBe(status);
      expect(mocks.verifyExternalAppSecret).not.toHaveBeenCalled();
    }
  );

  it('refuses an over-limit verified app before redeeming the token', async () => {
    limiter.limitVerifiedExternalAppExchange.mockResolvedValue(refusal(429));

    const response = await exchange({ token: 'handoff-token' });

    expect(response.status).toBe(429);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('paces a failed app secret and answers 429 once paced', async () => {
    mocks.verifyExternalAppSecret.mockResolvedValue({
      error: 'Invalid app credentials',
      ok: false,
    });

    expect((await exchange({ token: 'handoff-token' })).status).toBe(401);
    expect(limiter.paceExternalAppExchangeFailure).toHaveBeenCalledWith(
      source,
      'secret'
    );
    expect(limiter.limitVerifiedExternalAppExchange).not.toHaveBeenCalled();

    limiter.paceExternalAppExchangeFailure.mockResolvedValue(refusal(429));
    expect((await exchange({ token: 'handoff-token' })).status).toBe(429);
  });

  it('paces a failed handoff token as a token failure', async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect((await exchange({ token: 'handoff-token' })).status).toBe(401);
    expect(limiter.paceExternalAppExchangeFailure).toHaveBeenCalledWith(
      source,
      'token'
    );
  });

  it('admits and paces refresh exchanges without the verified-app count', async () => {
    // A refresh token for another app fails verification for this one.
    const response = await exchange({ refreshToken: refreshToken() });

    expect(response.status).toBe(401);
    expect(limiter.admitExternalAppExchange).toHaveBeenCalledWith(source);
    expect(limiter.limitVerifiedExternalAppExchange).not.toHaveBeenCalled();
    expect(limiter.paceExternalAppExchangeFailure).toHaveBeenCalledWith(
      source,
      'token'
    );
  });
});
