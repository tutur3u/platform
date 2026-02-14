import type { Page } from '@playwright/test';
import { AUTH_STATE_PATH, DEFAULT_LOCALE, TEST_USER } from './constants';

/**
 * Authenticates via the password login form and saves browser state.
 *
 * Strategy:
 *  1. Navigate to the login page with password tab active
 *  2. Fill in the password form with seed test credentials
 *  3. Submit — the app's Supabase browser client (createBrowserClient from
 *     @supabase/ssr) calls signInWithPassword() and stores the session in
 *     JS-accessible cookies via document.cookie
 *  4. Wait for the post-login redirect (middleware redirects authenticated users)
 *  5. Save storageState so subsequent tests skip login entirely
 *
 * Why UI-based login instead of API-based:
 *  - The app's createBrowserClient stores sessions in cookies (not localStorage).
 *  - A standalone createClient from @supabase/supabase-js uses localStorage instead,
 *    so page.evaluate() with a fresh client won't set the right cookies.
 *  - Server-side auth callbacks set HttpOnly cookies that storageState() can't capture.
 *  - The UI form uses the correctly configured client, so cookies persist properly.
 */
export async function authenticateTestUser(page: Page): Promise<void> {
  // Step 1: Navigate to login page with password tab
  // The ?passwordless=false query param ensures the password tab is shown
  await page.goto(`/${DEFAULT_LOCALE}/login?passwordless=false`, {
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
  // After signInWithPassword() succeeds, the form calls window.location.reload().
  // On reload, the login form detects the authenticated user and calls
  // processNextUrl() → router.push('/'), which navigates away from /login.
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });

  // Step 6: Let cookies settle after redirects
  await page.waitForTimeout(2_000);

  // Step 7: Save browser state (cookies + localStorage) for reuse
  await page.context().storageState({ path: AUTH_STATE_PATH });
}
