import { expect, test } from '@playwright/test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
} from './helpers/environment';

test.describe('Gateway app-session JWT auth', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('resolves every registered satellite return URL without cloud Supabase auth', async ({
    request,
  }) => {
    const cases = [
      ['calendar', 'http://localhost:7806/verify-token?nextUrl=%2Fdashboard'],
      [
        'calendar',
        'https://calendar.tuturuuu.com/verify-token?nextUrl=%2Fdashboard',
      ],
      ['cms', 'http://localhost:7811/verify-token?nextUrl=%2Fdashboard'],
      ['cms', 'https://cms.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['finance', 'http://localhost:7808/verify-token?nextUrl=%2Fdashboard'],
      [
        'finance',
        'https://finance.tuturuuu.com/verify-token?nextUrl=%2Fdashboard',
      ],
      ['hive', 'http://localhost:7814/verify-token?nextUrl=%2Fdashboard'],
      ['hive', 'https://hive.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['learn', 'http://localhost:7812/verify-token?nextUrl=%2Fdashboard'],
      ['learn', 'https://learn.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['nova', 'http://localhost:7805/verify-token?nextUrl=%2Fdashboard'],
      ['nova', 'https://nova.ai.vn/verify-token?nextUrl=%2Fdashboard'],
      ['rewise', 'http://localhost:7804/verify-token?nextUrl=%2Fdashboard'],
      ['rewise', 'https://rewise.me/verify-token?nextUrl=%2Fdashboard'],
      ['tudo', 'http://localhost:7809/verify-token?nextUrl=%2Fdashboard'],
      ['tudo', 'https://tasks.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['teach', 'http://localhost:7813/verify-token?nextUrl=%2Fdashboard'],
      ['teach', 'https://teach.tuturuuu.com/verify-token?nextUrl=%2Fdashboard'],
      ['track', 'http://localhost:7810/verify-token?nextUrl=%2Fdashboard'],
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
