import { verifyAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getAppDomainMap: vi.fn(),
  serverLoggerWarn: vi.fn(),
  verifyExternalAppSecret: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/internal-domains', () => ({
  getAppDomainMap: () => mocks.getAppDomainMap(),
}));

vi.mock('@/lib/app-coordination/external-apps', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/app-coordination/external-apps')
    >();

  return {
    ...actual,
    verifyExternalAppSecret: (
      ...args: Parameters<typeof mocks.verifyExternalAppSecret>
    ) => mocks.verifyExternalAppSecret(...args),
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: (...args: Parameters<typeof mocks.serverLoggerWarn>) =>
      mocks.serverLoggerWarn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

import { POST } from './route';

const victimUserId = '11111111-1111-4111-8111-111111111111';

describe('app token exchange route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TUTURUUU_APP_COORDINATION_SECRET = 'test-secret';

    mocks.getAppDomainMap.mockReturnValue([
      {
        name: 'cms',
        url: 'https://cms.tuturuuu.com',
      },
    ]);

    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            session_data: { email: 'victim@example.com' },
            user_id: victimUserId,
          },
        ],
        error: null,
      }),
    });
    mocks.createAdminClient.mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                email: 'victim@example.com',
              },
            },
            error: null,
          }),
        },
      },
    });
  });

  it('rejects configured target exchanges without app credentials', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/app-token/exchange', {
        body: JSON.stringify({
          requestedScopes: [],
          targetApp: 'cms',
          token: 'forged-cross-app-token',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing app credentials',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('exchanges a valid registered app credential for a scoped app token', async () => {
    mocks.verifyExternalAppSecret.mockResolvedValue({
      app: {
        allowedScopes: ['external-projects:read'],
        createdAt: null,
        createdBy: null,
        displayName: 'Yoola',
        enabled: true,
        id: 'yoola',
        origins: ['https://yoola.example.com'],
        secretIssuedAt: null,
        secretLastFour: 'test',
        updatedAt: null,
        updatedBy: null,
      },
      ok: true,
    });

    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/app-token/exchange', {
        body: JSON.stringify({
          appId: 'yoola',
          appSecret: 'ttr_app_secret_test',
          requestedScopes: ['external-projects:read'],
          token: 'valid-cross-app-token',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string };
    const verification = verifyAppCoordinationToken(body.accessToken, {
      secret: 'test-secret',
    });

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.sub).toBe(victimUserId);
      expect(verification.claims.target_app).toBe('yoola');
      expect(verification.claims.scopes).toEqual(['external-projects:read']);
    }
  });
});
