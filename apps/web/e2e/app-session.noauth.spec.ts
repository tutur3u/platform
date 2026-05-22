import { expect, test } from '@playwright/test';
import {
  createAppSessionRefreshToken,
  createAppSessionToken,
  createAppSessionTokenPair,
} from '@tuturuuu/auth/app-session';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
} from './helpers/environment';

test.describe('Gateway app-session JWT auth', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('rotates a valid internal app refresh token without Supabase cookies', async ({
    request,
  }) => {
    const secret =
      process.env.TUTURUUU_APP_COORDINATION_SECRET ??
      LOCAL_E2E_APP_COORDINATION_SECRET;
    const session = createAppSessionTokenPair(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      { secret }
    );

    const response = await request.post(
      '/api/v1/auth/cross-app-session/refresh',
      {
        data: {
          refreshToken: session.refresh.token,
          targetApp: 'nova',
        },
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['set-cookie'] ?? '').not.toContain('sb-');
    const body = (await response.json()) as {
      appSessionRefreshToken: string;
      appSessionToken: string;
    };
    expect(body.appSessionToken).toMatch(/^ttr_app_/u);
    expect(body.appSessionRefreshToken).toMatch(/^ttr_app_/u);
    expect(body.appSessionToken).not.toBe(session.access.token);
    expect(body.appSessionRefreshToken).not.toBe(session.refresh.token);
  });

  test('uses refreshed access for profile APIs when the original access is expired', async ({
    request,
  }) => {
    const secret =
      process.env.TUTURUUU_APP_COORDINATION_SECRET ??
      LOCAL_E2E_APP_COORDINATION_SECRET;
    const expiredAccess = createAppSessionToken(
      {
        email: TEST_USER.email,
        expiresInSeconds: 1,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      {
        now: new Date('2026-01-01T00:00:00.000Z'),
        secret,
      }
    );
    const refresh = createAppSessionRefreshToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      { secret }
    );

    const refreshResponse = await request.post(
      '/api/v1/auth/cross-app-session/refresh',
      {
        data: {
          accessToken: expiredAccess.token,
          refreshToken: refresh.token,
          targetApp: 'nova',
        },
        failOnStatusCode: false,
      }
    );
    expect(refreshResponse.status()).toBe(200);
    const refreshBody = (await refreshResponse.json()) as {
      appSessionToken: string;
    };

    const profileResponse = await request.get('/api/v1/users/me/profile', {
      failOnStatusCode: false,
      headers: {
        Authorization: `Bearer ${refreshBody.appSessionToken}`,
      },
    });

    expect(profileResponse.status()).toBe(200);
    const profile = (await profileResponse.json()) as {
      id: string;
    };
    expect(profile.id).toBe(TEST_USER.id);
  });

  test('rejects refresh tokens as bearer access tokens', async ({
    request,
  }) => {
    const secret =
      process.env.TUTURUUU_APP_COORDINATION_SECRET ??
      LOCAL_E2E_APP_COORDINATION_SECRET;
    const session = createAppSessionTokenPair(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      { secret }
    );

    const response = await request.get('/api/v1/users/me/profile', {
      failOnStatusCode: false,
      headers: {
        Authorization: `Bearer ${session.refresh.token}`,
      },
    });

    expect(response.status()).toBe(401);
  });

  test('rejects invalid refresh credentials without Supabase fallback', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/v1/auth/cross-app-session/refresh',
      {
        data: {
          refreshToken: 'ttr_app_invalid',
          targetApp: 'nova',
        },
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(401);
    expect(response.headers()['set-cookie'] ?? '').not.toContain('sb-');
  });

  test('upgrades a still-valid legacy access-only app session', async ({
    request,
  }) => {
    const secret =
      process.env.TUTURUUU_APP_COORDINATION_SECRET ??
      LOCAL_E2E_APP_COORDINATION_SECRET;
    const access = createAppSessionToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      { secret }
    );

    const response = await request.post(
      '/api/v1/auth/cross-app-session/refresh',
      {
        data: {
          accessToken: access.token,
          targetApp: 'nova',
        },
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      appSessionRefreshToken: string;
      appSessionToken: string;
    };
    expect(body.appSessionToken).toMatch(/^ttr_app_/u);
    expect(body.appSessionRefreshToken).toMatch(/^ttr_app_/u);
  });

  test('resolves every registered satellite return URL without cloud Supabase auth', async ({
    request,
  }) => {
    const cases = [
      ['calendar', 'http://localhost:7806/verify-token?nextUrl=%2Fdashboard'],
      [
        'calendar',
        'https://calendar.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      [
        'calendar',
        'https://calendar.tuturuuu.com/verify-token?nextUrl=%2Fdashboard',
      ],
      ['cms', 'http://localhost:7811/verify-token?nextUrl=%2Fdashboard'],
      [
        'cms',
        'https://cms.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['cms', 'https://cms.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['finance', 'http://localhost:7808/verify-token?nextUrl=%2Fdashboard'],
      [
        'finance',
        'https://finance.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      [
        'finance',
        'https://finance.tuturuuu.com/verify-token?nextUrl=%2Fdashboard',
      ],
      ['inventory', 'http://localhost:7815/verify-token?nextUrl=%2Fdashboard'],
      [
        'inventory',
        'https://inventory.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      [
        'inventory',
        'https://inventory.tuturuuu.com/verify-token?nextUrl=%2Fdashboard',
      ],
      ['hive', 'http://localhost:7814/verify-token?nextUrl=%2Fdashboard'],
      [
        'hive',
        'https://hive.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['hive', 'https://hive.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['learn', 'http://localhost:7812/verify-token?nextUrl=%2Fdashboard'],
      [
        'learn',
        'https://learn.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['learn', 'https://learn.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['nova', 'http://localhost:7805/verify-token?nextUrl=%2Fdashboard'],
      [
        'nova',
        'https://nova.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['nova', 'https://nova.ai.vn/verify-token?nextUrl=%2Fdashboard'],
      ['rewise', 'http://localhost:7804/verify-token?nextUrl=%2Fdashboard'],
      [
        'rewise',
        'https://rewise.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['rewise', 'https://rewise.me/verify-token?nextUrl=%2Fdashboard'],
      ['tasks', 'http://localhost:7809/verify-token?nextUrl=%2Fdashboard'],
      [
        'tasks',
        'https://tasks.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['tasks', 'https://tasks.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['teach', 'http://localhost:7813/verify-token?nextUrl=%2Fdashboard'],
      [
        'teach',
        'https://teach.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['teach', 'https://teach.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['track', 'http://localhost:7810/verify-token?nextUrl=%2Fdashboard'],
      [
        'track',
        'https://track.tuturuuu.localhost/verify-token?nextUrl=%2Fdashboard',
      ],
      ['track', 'https://track.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
    ] as const;

    for (const [targetApp, returnUrl] of cases) {
      const response = await request.post('/api/v1/auth/cross-app-return', {
        data: {
          generateToken: false,
          returnUrl,
        },
        failOnStatusCode: false,
      });

      expect(response.status(), `${targetApp} return URL`).toBe(200);
      expect(response.headers()['set-cookie'] ?? '').not.toContain('sb-');
      const body = (await response.json()) as { targetApp: string };
      expect(body.targetApp).toBe(targetApp);
    }
  });

  test('resolves the current user from a Tuturuuu app-session bearer token', async ({
    request,
  }) => {
    const { token } = createAppSessionToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      {
        secret:
          process.env.TUTURUUU_APP_COORDINATION_SECRET ??
          LOCAL_E2E_APP_COORDINATION_SECRET,
      }
    );

    const response = await request.get('/api/v1/users/me/profile', {
      failOnStatusCode: false,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      email: string | null;
      id: string;
    };

    expect(body.id).toBe(TEST_USER.id);
    expect(body.email).toBe(TEST_USER.email);
    expect(response.headers()['set-cookie'] ?? '').not.toContain('sb-');
  });

  test('rejects a malformed app-session bearer token without falling back to Supabase auth', async ({
    request,
  }) => {
    const { token } = createAppSessionToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      {
        secret:
          process.env.TUTURUUU_APP_COORDINATION_SECRET ??
          LOCAL_E2E_APP_COORDINATION_SECRET,
      }
    );
    const malformedToken = `${token.slice(0, -8)}not-valid`;

    const response = await request.get('/api/v1/users/me/profile', {
      failOnStatusCode: false,
      headers: {
        Authorization: `Bearer ${malformedToken}`,
      },
    });

    expect(response.status()).toBe(401);
  });
});
