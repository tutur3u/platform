import type { Page } from '@playwright/test';
import { AUTH_STATE_PATH, DEFAULT_LOCALE, TEST_USER, WEB_BASE_URL } from './constants';

/**
 * Authenticates via the web app's password login form and saves browser state.
 *
 * The tasks app shares Supabase auth with the web app. Since both apps run on
 * localhost (different ports), the Supabase browser client stores session cookies
 * scoped to the Supabase URL (not the app URL), so authenticating through the
 * web app's login page sets cookies that work for the tasks app too.
 *
 * Strategy:
 *  1. Navigate to the web app's login page with password tab active
 *  2. Fill in the password form with seed test credentials
 *  3. Submit — the app's Supabase browser client stores the session in cookies
 *  4. Wait for the post-login redirect
 *  5. Navigate to the tasks app to verify the session is valid
 *  6. Save storageState so subsequent tests skip login entirely
 */
export async function authenticateTestUser(page: Page): Promise<void> {
  // Step 1: Navigate to web app login page with password tab
  await page.goto(`${WEB_BASE_URL}/${DEFAULT_LOCALE}/login?passwordless=false`, {
    waitUntil: 'domcontentloaded',
  });

  // Step 2: Wait for the login form to render (Turbopack may need time to compile)
  const emailInput = page
    .getByPlaceholder('Enter your email or username')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });

  // Step 3: Fill in test credentials
  await emailInput.clear();
  await emailInput.fill(TEST_USER.email);

  const passwordInput = page.getByPlaceholder('Enter your password');
  await passwordInput.clear();
  await passwordInput.fill(TEST_USER.password);

  // Step 4: Submit the form
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();

  // Step 5: Wait for successful auth redirect
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });

  // Step 6: Let cookies settle after redirects
  await page.waitForTimeout(2_000);

  // Step 7: Save browser state (cookies + localStorage) for reuse
  await page.context().storageState({ path: AUTH_STATE_PATH });
}
