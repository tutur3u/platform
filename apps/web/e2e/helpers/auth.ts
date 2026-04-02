import type { Locator, Page } from '@playwright/test';
import { AUTH_STATE_PATH, TEST_USER } from './constants';

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
  // We use the locale-agnostic path to avoid unnecessary redirects.
  await page.goto('/login?passwordless=false', {
    waitUntil: 'domcontentloaded',
  });

  // Step 2: Advance through the current identify step until the password form
  // is visible. The login UI is multi-step now, but older environments can
  // still render the password field immediately.
  const passwordInput = await openPasswordStage(page, TEST_USER.email);

  // Step 3: Fill in test credentials
  await passwordInput.clear();
  await passwordInput.fill(TEST_USER.password);

  // Step 4: Submit the form
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();

  // Step 5: Wait for successful post-login state
  // The current auth flow can stay on /login (e.g., temporary OTP layout changes)
  // while still being authenticated, so don't require URL to change.
  await page.waitForFunction(
    async () => {
      try {
        const response = await fetch('/api/v1/users/me/profile', {
          cache: 'no-store',
        });
        if (!response.ok) return false;
        const data = await response.json();
        return Boolean(data?.id);
      } catch {
        return false;
      }
    },
    {
      timeout: 60_000,
    }
  );

  // Step 6: Let cookies settle after redirects
  await page.waitForTimeout(2_000);

  // Step 7: Save browser state (cookies + localStorage) for reuse
  await page.context().storageState({ path: AUTH_STATE_PATH });
}

export async function openPasswordStage(
  page: Page,
  email: string
): Promise<Locator> {
  const emailInput = page
    .getByPlaceholder('Enter your email or username')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });
  await emailInput.clear();
  await emailInput.fill(email);

  const passwordInput = page.getByPlaceholder('Enter your password');
  if (await passwordInput.isVisible()) {
    return passwordInput;
  }

  await page.getByRole('button', { name: /^continue$/i }).click();
  await passwordInput.waitFor({ state: 'visible', timeout: 30_000 });

  return passwordInput;
}
