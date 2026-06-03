import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SATELLITE_E2E_URL = 'https://tasks.tuturuuu.localhost';

function getSupabaseAuthStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

async function createLocalDevSession(page: Page) {
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

  return storageKey;
}

test.describe('Shared Supabase auth cookies', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('local dev-session writes a Supabase cookie shared with Tuturuuu localhost satellites', async ({
    page,
  }) => {
    const storageKey = await createLocalDevSession(page);

    const storedWebCookie = (
      await page.context().cookies(LOCAL_E2E_BASE_URL)
    ).find((cookie) => cookie.name === storageKey);
    expect(storedWebCookie).toMatchObject({
      domain: '.tuturuuu.localhost',
      name: storageKey,
      path: '/',
    });

    expect(
      (await page.context().cookies(SATELLITE_E2E_URL)).some(
        (cookie) =>
          cookie.name === storageKey &&
          cookie.domain === '.tuturuuu.localhost' &&
          cookie.path === '/'
      )
    ).toBe(true);
  });

  test('shared-cookie middleware removes old host-only Supabase duplicates', async ({
    page,
  }) => {
    const storageKey = await createLocalDevSession(page);
    const sharedCookies = (await page.context().cookies(LOCAL_E2E_BASE_URL))
      .filter(
        (cookie) =>
          (cookie.name === storageKey ||
            cookie.name.startsWith(`${storageKey}.`)) &&
          cookie.domain === '.tuturuuu.localhost'
      )
      .map((cookie) => ({
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        name: cookie.name,
        sameSite: cookie.sameSite,
        secure: cookie.secure,
        url: LOCAL_E2E_BASE_URL,
        value: cookie.value,
      }));

    expect(sharedCookies.length).toBeGreaterThan(0);
    await page.context().addCookies(sharedCookies);

    await expect
      .poll(
        async () =>
          (await page.context().cookies(LOCAL_E2E_BASE_URL)).some(
            (cookie) =>
              cookie.name.startsWith(storageKey) &&
              cookie.domain === 'tuturuuu.localhost'
          ),
        { timeout: 15_000 }
      )
      .toBe(true);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect
      .poll(
        async () =>
          (await page.context().cookies(LOCAL_E2E_BASE_URL)).filter(
            (cookie) =>
              cookie.name.startsWith(storageKey) &&
              cookie.domain === 'tuturuuu.localhost'
          ).length,
        { timeout: 15_000 }
      )
      .toBe(0);

    expect(
      (await page.context().cookies(SATELLITE_E2E_URL)).some(
        (cookie) =>
          cookie.name.startsWith(storageKey) &&
          cookie.domain === '.tuturuuu.localhost'
      )
    ).toBe(true);
  });
});
