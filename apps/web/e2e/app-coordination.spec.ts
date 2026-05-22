import { expect, test } from '@playwright/test';
import {
  createAppSessionTokenPair,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
} from './helpers/environment';

test.describe('Infrastructure app coordination settings', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('root operator updates session durations and reset restores defaults', async ({
    request,
  }) => {
    const currentResponse = await request.get(
      '/api/v1/infrastructure/app-coordination',
      { failOnStatusCode: false }
    );
    test.skip(
      currentResponse.status() === 403,
      'Seed user does not have root Infrastructure permissions'
    );
    expect(currentResponse.status()).toBe(200);

    const current = (await currentResponse.json()) as {
      policy: typeof DEFAULT_APP_COORDINATION_SESSION_POLICY;
    };
    const updatedPolicy = {
      ...current.policy,
      internalAppAccessTtlSeconds: 900,
      internalAppOverrides: {
        ...current.policy.internalAppOverrides,
        nova: {
          internalAppAccessTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 86_400,
        },
      },
      internalAppRefreshEarlySeconds: 180,
      internalAppRefreshTtlSeconds: 172_800,
    };

    const saveResponse = await request.put(
      '/api/v1/infrastructure/app-coordination',
      {
        data: updatedPolicy,
        failOnStatusCode: false,
      }
    );
    expect(saveResponse.status()).toBe(200);

    const secret =
      process.env.TUTURUUU_APP_COORDINATION_SECRET ??
      LOCAL_E2E_APP_COORDINATION_SECRET;
    const session = createAppSessionTokenPair(
      {
        email: TEST_USER.email,
        targetApp: 'nova',
        userId: TEST_USER.id,
      },
      { secret }
    );
    const refreshResponse = await request.post(
      '/api/v1/auth/cross-app-session/refresh',
      {
        data: {
          refreshToken: session.refresh.token,
          targetApp: 'nova',
        },
        failOnStatusCode: false,
      }
    );
    expect(refreshResponse.status()).toBe(200);
    const refreshBody = (await refreshResponse.json()) as {
      appSessionToken: string;
    };
    const verification = verifyAppSessionToken(refreshBody.appSessionToken, {
      secret,
      targetApp: 'nova',
    });
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.exp - verification.claims.iat).toBe(600);
    }

    const resetResponse = await request.put(
      '/api/v1/infrastructure/app-coordination',
      {
        data: DEFAULT_APP_COORDINATION_SESSION_POLICY,
        failOnStatusCode: false,
      }
    );
    expect(resetResponse.status()).toBe(200);
    const resetBody = (await resetResponse.json()) as {
      policy: typeof DEFAULT_APP_COORDINATION_SESSION_POLICY;
    };
    expect(resetBody.policy).toEqual(DEFAULT_APP_COORDINATION_SESSION_POLICY);
  });
});
