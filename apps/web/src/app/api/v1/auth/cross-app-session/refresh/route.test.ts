import {
  createAppSessionRefreshToken,
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getAppCoordinationSessionPolicy: vi.fn(),
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

function request(body: unknown) {
  return new NextRequest(
    'https://tuturuuu.localhost/api/v1/auth/cross-app-session/refresh',
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  );
}

describe('cross-app app-session refresh route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.getAppCoordinationSessionPolicy.mockResolvedValue({
      policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
      source: 'default',
    });
    mocks.createAdminClient.mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                email: 'agent@example.com',
                id: 'user-1',
              },
            },
            error: null,
          }),
        },
      },
    });
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      del: vi.fn(),
      decr: vi.fn(),
      expire: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      incr: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      ttl: vi.fn(),
    });
  });

  it('rotates a valid refresh token into a new Web-issued pair', async () => {
    const oldSession = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });

    const response = await POST(
      request({
        refreshToken: oldSession.refresh.token,
        targetApp: 'learn',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      appSessionRefreshEarlySeconds: 900,
      sessionData: { email: 'agent@example.com' },
      userId: 'user-1',
      valid: true,
    });
    expect(body.appSessionToken).toMatch(/^ttr_app_/u);
    expect(body.appSessionRefreshToken).toMatch(/^ttr_app_/u);
  });

  it('rejects invalid bodies and unknown apps', async () => {
    await expect(POST(request({ targetApp: 'learn' }))).resolves.toHaveProperty(
      'status',
      401
    );
    await expect(
      POST(request({ refreshToken: 'ttr_app_invalid', targetApp: 'nope' }))
    ).resolves.toHaveProperty('status', 400);
  });

  it('rejects refresh tokens for a different target app', async () => {
    const oldSession = createAppSessionTokenPair({
      targetApp: 'teach',
      userId: 'user-1',
    });

    const response = await POST(
      request({
        refreshToken: oldSession.refresh.token,
        targetApp: 'learn',
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects expired refresh tokens', async () => {
    vi.useFakeTimers();
    const refresh = createAppSessionRefreshToken(
      {
        expiresInSeconds: 1,
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));

    const response = await POST(
      request({ refreshToken: refresh.token, targetApp: 'learn' })
    );

    expect(response.status).toBe(401);
    vi.useRealTimers();
  });

  it('rejects access tokens supplied as refresh tokens', async () => {
    const oldSession = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });

    const response = await POST(
      request({
        refreshToken: oldSession.access.token,
        targetApp: 'learn',
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects access-only refresh requests without minting a token pair', async () => {
    const access = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });

    const response = await POST(
      request({
        accessToken: access.token,
        targetApp: 'learn',
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.getAppCoordinationSessionPolicy).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects refresh when the user no longer exists', async () => {
    mocks.createAdminClient.mockResolvedValueOnce({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      },
    });
    const oldSession = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });

    const response = await POST(
      request({ refreshToken: oldSession.refresh.token, targetApp: 'learn' })
    );

    expect(response.status).toBe(401);
  });
});
