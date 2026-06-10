import { expect, type Page, test } from '@playwright/test';
import { openPasswordStage } from './helpers/auth';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import { assertSafeE2EEnvironment } from './helpers/environment';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateWithNewContextForTests,
  resetDbRateLimits,
  setWebOtpEnabled,
} from './helpers/rate-limits';

const SECOND_USER = {
  email: 'user1@tuturuuu.com',
  id: '00000000-0000-0000-0000-000000000002',
  password: 'password123',
} as const;

async function loginWithPassword(page: Page, email: string) {
  await page.goto(`/${DEFAULT_LOCALE}/login`, {
    waitUntil: 'domcontentloaded',
  });

  const passwordInput = await openPasswordStage(page, email);
  await passwordInput.clear();
  await passwordInput.fill('password123');

  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
}

async function currentProfile(page: Page) {
  const response = await page
    .context()
    .request.get(new URL('/api/v1/users/me/profile', page.url()).toString());

  if (!response.ok()) {
    throw new Error(`Profile request failed: ${response.status()}`);
  }

  return (await response.json()) as { email?: string; id?: string };
}

async function postAccountMutation<T>(
  page: Page,
  path: string,
  payload?: Record<string, unknown>
) {
  const response = await page.context().request.post(
    new URL(path, page.url()).toString(),
    payload
      ? {
          data: payload,
        }
      : undefined
  );

  if (!response.ok()) {
    throw new Error(`${path} failed: ${response.status()}`);
  }

  return (await response.json()) as T;
}

async function switchAccount(page: Page, accountId: string) {
  const currentUrl = new URL(page.url());
  const response = await postAccountMutation<{
    redirectTo?: string;
    success?: boolean;
  }>(page, '/api/v1/auth/accounts/switch', {
    accountId,
    currentRoute: `${currentUrl.pathname}${currentUrl.search}`,
  });

  expect(response.success).toBe(true);
  await page.goto(response.redirectTo || `/${DEFAULT_LOCALE}/personal/tasks`, {
    waitUntil: 'domcontentloaded',
  });
}

async function saveCurrentAccount(page: Page) {
  const currentUrl = new URL(page.url());
  const response = await postAccountMutation<{ success?: boolean }>(
    page,
    '/api/v1/auth/accounts/current',
    {
      route: `${currentUrl.pathname}${currentUrl.search}`,
    }
  );

  expect(response.success).toBe(true);
}

async function logoutCurrent(page: Page) {
  const response = await postAccountMutation<{
    redirectTo?: string;
    success?: boolean;
  }>(page, '/api/v1/auth/accounts/logout');

  expect(response.success).toBe(true);
  await page.goto(response.redirectTo || `/${DEFAULT_LOCALE}/personal/tasks`, {
    waitUntil: 'domcontentloaded',
  });
}

async function logoutAll(page: Page) {
  const response = await postAccountMutation<{
    redirectTo?: string;
    success?: boolean;
  }>(page, '/api/v1/auth/accounts/logout-all');

  expect(response.success).toBe(true);
  await page.goto(response.redirectTo || '/login', {
    waitUntil: 'domcontentloaded',
  });
}

test.describe('Multi-account server vault', () => {
  test.beforeEach(async ({ page, playwright }, testInfo) => {
    assertSafeE2EEnvironment();
    const clientHeaders = e2eClientHeaders(e2eClientIpForTest(testInfo, 610));

    await page.setExtraHTTPHeaders(clientHeaders);
    await resetDbRateLimits();
    await resetAppRateLimitStateWithNewContextForTests(playwright.request, {
      email: `e2e-multi-account-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}@tuturuuu.com`,
      headers: clientHeaders,
      locale: DEFAULT_LOCALE,
    });
    await page.context().clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test('renders login form and drains accidental OAuth callback code from login URL', async ({
    page,
  }) => {
    await page.goto(
      `/login?returnUrl=${encodeURIComponent(`/${DEFAULT_LOCALE}/personal/tasks`)}`,
      {
        waitUntil: 'domcontentloaded',
      }
    );
    await expect(
      page.getByPlaceholder('Enter your email or username')
    ).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(
      `/login?code=e2e-oauth-code&multiAccount=true&returnUrl=${encodeURIComponent(`/${DEFAULT_LOCALE}/personal/tasks`)}`,
      {
        waitUntil: 'domcontentloaded',
      }
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.has('code'), {
        timeout: 30_000,
      })
      .toBe(false);
    await expect(
      page.getByPlaceholder('Enter your email or username')
    ).toBeVisible({
      timeout: 30_000,
    });
  });

  test('adds, switches, and logs out multiple accounts without localStorage sessions', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const previousOtpState = await setWebOtpEnabled(false);

    try {
      await loginWithPassword(page, TEST_USER.email);
      await expect
        .poll(async () => (await currentProfile(page)).id)
        .toBe(TEST_USER.id);

      await saveCurrentAccount(page);

      await page.goto(
        `/login?multiAccount=true&returnUrl=${encodeURIComponent(`/${DEFAULT_LOCALE}/personal/tasks`)}`,
        { waitUntil: 'domcontentloaded' }
      );
      const passwordInput = await openPasswordStage(page, SECOND_USER.email);
      await passwordInput.clear();
      await passwordInput.fill(SECOND_USER.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      await page.waitForURL(
        (url) =>
          !url.pathname.includes('/login') &&
          !url.pathname.includes('/add-account'),
        { timeout: 60_000, waitUntil: 'domcontentloaded' }
      );
      await expect
        .poll(async () => (await currentProfile(page)).id)
        .toBe(SECOND_USER.id);

      await expect
        .poll(() =>
          page.evaluate(() =>
            window.localStorage.getItem('tuturuuu_multi_session_store')
          )
        )
        .toBe(null);

      await switchAccount(page, TEST_USER.id);
      await expect
        .poll(async () => (await currentProfile(page)).id)
        .toBe(TEST_USER.id);

      await logoutCurrent(page);
      await expect
        .poll(async () => (await currentProfile(page)).id)
        .toBe(SECOND_USER.id);

      await logoutAll(page);
      await expect(
        page.getByPlaceholder('Enter your email or username')
      ).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      if (previousOtpState !== null) {
        await setWebOtpEnabled(previousOtpState);
      }
    }
  });
});
