import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

function getSupabaseAuthStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

test.describe('Shared Supabase auth cookies', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('local dev-session writes a Supabase cookie shared with Tuturuuu localhost satellites', async ({
    page,
  }) => {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
    const storageKey = getSupabaseAuthStorageKey(supabaseUrl);

    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const response = await page.evaluate(
      async ({ email, locale }) => {
        const response = await fetch('/api/auth/dev-session', {
          body: JSON.stringify({
            completeOnboarding: true,
            email,
            locale,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });

        return {
          body: await response.text(),
          ok: response.ok,
          status: response.status,
        };
      },
      {
        email: TEST_USER.email,
        locale: DEFAULT_LOCALE,
      }
    );

    expect(response, response.body).toMatchObject({
      ok: true,
      status: 200,
    });

    await expect
      .poll(
        async () =>
          (await page.context().cookies(LOCAL_E2E_BASE_URL)).some(
            (cookie) => cookie.name === storageKey
          ),
        { timeout: 15_000 }
      )
      .toBe(true);

    const storedWebCookie = (
      await page.context().cookies(LOCAL_E2E_BASE_URL)
    ).find((cookie) => cookie.name === storageKey);
    expect(storedWebCookie).toMatchObject({
      domain: '.tuturuuu.localhost',
      name: storageKey,
      path: '/',
    });

    expect(
      (await page.context().cookies('https://tasks.tuturuuu.localhost')).some(
        (cookie) =>
          cookie.name === storageKey &&
          cookie.domain === '.tuturuuu.localhost' &&
          cookie.path === '/'
      )
    ).toBe(true);
  });
});
