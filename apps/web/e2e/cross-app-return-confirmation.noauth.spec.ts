import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const EXTERNAL_APP_SECRET_PREFIX = 'EXTERNAL_APP_REGISTRY';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders({ prefer }: { prefer?: string } = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

function appFieldKey(appId: string, field: string) {
  return `${EXTERNAL_APP_SECRET_PREFIX}:${appId}:${field}`;
}

async function deleteExternalAppRows(
  request: {
    delete: (
      url: string,
      options: {
        failOnStatusCode: false;
        headers: ReturnType<typeof serviceHeaders>;
      }
    ) => Promise<{ status: () => number }>;
  },
  appId: string
) {
  for (const field of ['displayName', 'enabled', 'origins']) {
    await request.delete(
      `${SUPABASE_URL}/rest/v1/workspace_secrets?ws_id=eq.${ROOT_WORKSPACE_ID}&name=eq.${encodeURIComponent(appFieldKey(appId, field))}`,
      {
        failOnStatusCode: false,
        headers: serviceHeaders(),
      }
    );
  }
}

test.describe('Cross-app return confirmation', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('requires confirmation before returning to a registered external app', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const appId = `e2e-return-${randomUUID().slice(0, 8)}`;
    const appName = 'E2E External';
    const externalOrigin = 'http://127.0.0.1:7799';
    const returnUrl = `${externalOrigin}/callback?state=confirm`;
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 319));
    const email = `e2e-cross-app-return-${Date.now()}@tuturuuu.com`;
    const context = await browser.newContext({ extraHTTPHeaders: headers });
    const page = await context.newPage();

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email,
        headers,
        locale: DEFAULT_LOCALE,
      });

      await deleteExternalAppRows(request, appId);
      const registryResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_secrets`,
        {
          data: [
            {
              name: appFieldKey(appId, 'displayName'),
              value: appName,
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              name: appFieldKey(appId, 'enabled'),
              value: 'true',
              ws_id: ROOT_WORKSPACE_ID,
            },
            {
              name: appFieldKey(appId, 'origins'),
              value: JSON.stringify([externalOrigin]),
              ws_id: ROOT_WORKSPACE_ID,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(registryResponse.status()).toBe(201);

      const sessionResponse = await page.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      await page.goto(
        `${origin}/${DEFAULT_LOCALE}/login?returnUrl=${encodeURIComponent(returnUrl)}`,
        { waitUntil: 'domcontentloaded' }
      );

      await expect(
        page.getByRole('button', { name: `Continue to ${appName}` })
      ).toBeVisible();
      await expect(page.getByText('Signed in as')).toBeVisible();
      const currentUrl = new URL(page.url());
      expect(currentUrl.pathname).toBe('/login');
      expect(currentUrl.searchParams.get('returnUrl')).toBe(returnUrl);
      expect(currentUrl.searchParams.has('token')).toBe(false);
      expect(currentUrl.searchParams.has('targetApp')).toBe(false);
    } finally {
      await deleteExternalAppRows(request, appId);
      await context.close();
    }
  });
});
