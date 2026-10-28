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

import * as appSession from '@tuturuuu/auth/app-session';
import {
  createAppSessionRefreshToken,
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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
                email_confirmed_at: '2026-01-01',
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
      eval: vi.fn(),
      decr: vi.fn(),
      expire: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      incr: vi.fn(),
      mget: vi.fn(),
      scan: vi.fn(),
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

  it.each([null, undefined])(
    'drops old email claims when Auth has no confirmed mailbox',
    async (email_confirmed_at) => {
      mocks.createAdminClient.mockResolvedValue({
        auth: {
          admin: {
            getUserById: async () => ({
              data: {
                user: {
                  id: 'user-1',
                  email: 'pending@tuturuuu.com',
                  email_confirmed_at,
                },
              },
              error: null,
            }),
          },
        },
      });
      const oldSession = createAppSessionTokenPair({
        targetApp: 'infra',
        userId: 'user-1',
        email: 'old@tuturuuu.com',
      });
      const response = await POST(
        request({ refreshToken: oldSession.refresh.token, targetApp: 'infra' })
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.sessionData.email ?? null).toBeNull();
      const verification = appSession.verifyAppSessionToken(
        body.appSessionToken,
        { targetApp: 'infra' }
      );
      expect(verification.ok).toBe(true);
      if (verification.ok) expect(verification.claims.email ?? null).toBeNull();
    }
  );

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

  async function expectDenied(response: Response, status: 401 | 503) {
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual(
      status === 503
        ? {
            code: 'APP_SESSION_REFRESH_UNAVAILABLE',
            error: 'App session refresh temporarily unavailable',
          }
        : { error: 'Invalid or expired app session refresh credentials' }
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  }

  it.each(['null', 'acquisition', 'get', 'set'])(
    'returns a temporary failure without admission when replay storage fails: %s',
    async (failure) => {
      const session = createAppSessionTokenPair({
        targetApp: 'learn',
        userId: 'user-1',
      });
      const mint = vi.spyOn(appSession, 'createAppSessionTokenPair');
      const redis = await getUpstashRestRedisClient();
      if (!redis) throw new Error('Expected the default replay fixture');
      const providerError = new Error('private replay backend detail');
      switch (failure) {
        case 'null':
          vi.mocked(getUpstashRestRedisClient).mockResolvedValue(null);
          break;
        case 'acquisition':
          vi.mocked(getUpstashRestRedisClient).mockRejectedValue(providerError);
          break;
        case 'get':
          vi.mocked(redis.get).mockRejectedValue(providerError);
          break;
        case 'set':
          // No stored timestamp: an intact post-grace read never reaches set.
          vi.mocked(redis.get).mockResolvedValue(null);
          vi.mocked(redis.set).mockRejectedValue(providerError);
          break;
        default:
          throw new Error('Unexpected outage fixture');
      }
      const response = await POST(
        request({ refreshToken: session.refresh.token, targetApp: 'learn' })
      );
      await expectDenied(response, 503);
      expect(mint).not.toHaveBeenCalled();
    }
  );

  it('consumes once, permits configured grace, then rejects the same credential', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-01-01T00:00:00.000Z');
    vi.setSystemTime(start);
    const graceSeconds = 7;
    mocks.getAppCoordinationSessionPolicy.mockResolvedValue({
      policy: {
        ...DEFAULT_APP_COORDINATION_SESSION_POLICY,
        browserRefreshReplayGraceSeconds: graceSeconds,
      },
      source: 'default',
    });
    const state = new Map<string, { value: string; expiresAt: number }>();
    const redis = await getUpstashRestRedisClient();
    if (!redis) throw new Error('Expected the default replay fixture');
    const get = vi.fn().mockImplementation(async (key: string) => {
      const row = state.get(key);
      if (!row || row.expiresAt <= Date.now()) {
        state.delete(key);
        return null;
      }
      return row.value;
    });
    const set = vi
      .fn()
      .mockImplementation(
        async (
          key: string,
          value: string,
          options: { ex: number; nx: boolean }
        ) => {
          if (!options || !('ex' in options) || !('nx' in options)) {
            throw new Error('Expected expiring NX replay write');
          }
          if (options.nx && state.has(key)) return null;
          state.set(key, {
            value,
            expiresAt: Date.now() + options.ex * 1000,
          });
          return 'OK';
        }
      );
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      ...redis,
      get,
      set,
    });
    const session = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const mint = vi.spyOn(appSession, 'createAppSessionTokenPair');
    const refresh = () =>
      POST(
        request({ refreshToken: session.refresh.token, targetApp: 'learn' })
      );
    for (const seconds of [0, graceSeconds]) {
      vi.setSystemTime(new Date(start.getTime() + seconds * 1000));
      const response = await refresh();
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        valid: true,
        userId: 'user-1',
        appSessionToken: expect.stringMatching(/^ttr_app_/u),
        appSessionRefreshToken: expect.stringMatching(/^ttr_app_/u),
      });
      expect([...state.values()]).toEqual([
        {
          value: String(start.getTime() / 1000),
          expiresAt: session.refresh.claims.exp * 1000,
        },
      ]);
    }
    vi.setSystemTime(new Date(start.getTime() + (graceSeconds + 1) * 1000));
    mocks.createAdminClient.mockClear();
    mint.mockClear();
    set.mockRejectedValue(new Error('write must not be reached'));
    await expectDenied(await refresh(), 401);
    expect(mint).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);

    for (const failure of ['null', 'acquisition', 'get']) {
      if (failure === 'null') {
        vi.mocked(getUpstashRestRedisClient).mockResolvedValue(null);
      } else if (failure === 'acquisition') {
        vi.mocked(getUpstashRestRedisClient).mockRejectedValue(
          new Error('unavailable')
        );
      } else {
        get.mockRejectedValue(new Error('unavailable'));
        vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
          ...redis,
          get,
          set,
        });
      }
      await expectDenied(await refresh(), 503);
      expect(mint).not.toHaveBeenCalled();
    }
  });

  it('rejects invalid signatures before attempting replay storage', async () => {
    const session = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const mint = vi.spyOn(appSession, 'createAppSessionTokenPair');
    await expectDenied(
      await POST(
        request({
          refreshToken: `${session.refresh.token}invalid`,
          targetApp: 'learn',
        })
      ),
      401
    );
    expect(getUpstashRestRedisClient).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it('keeps required MFA as a separate healthy-store rejection without minting credentials', async () => {
    const refresh = createAppSessionRefreshToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    mocks.createAdminClient.mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'user-1',
                app_metadata: {
                  tuturuuu_required_mfa: { required: true, verifiedAfter: 0 },
                },
              },
            },
            error: null,
          }),
        },
      },
    });
    const mint = vi.spyOn(appSession, 'createAppSessionTokenPair');
    const response = await POST(
      request({ refreshToken: refresh.token, targetApp: 'learn' })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'MFA_REQUIRED',
      error: 'MFA verification required',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mint).not.toHaveBeenCalled();
  });
});
