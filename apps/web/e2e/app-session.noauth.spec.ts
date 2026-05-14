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
