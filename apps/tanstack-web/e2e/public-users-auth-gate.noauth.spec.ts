import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/public-routes';

/**
 * Auth-gated public-profile routes live under the marketing route group in the
 * legacy app, but they are not anonymous public marketing pages. Anonymous
 * visitors must hit the fail-closed TanStack auth gate before any profile
 * lookup runs.
 */
test.describe('Public user profile auth gate (unauthenticated)', () => {
  test('redirects anonymous community profile access to login', async ({
    page,
  }) => {
    const target = `/${DEFAULT_LOCALE}/users/__e2e_missing_handle__`;

    await page.goto(target, { waitUntil: 'domcontentloaded' });

    const url = new URL(page.url());

    expect(url.pathname).toBe(`/${DEFAULT_LOCALE}/login`);
    expect(url.searchParams.get('nextUrl')).toBe(
      '/users/__e2e_missing_handle__'
    );
  });
});
