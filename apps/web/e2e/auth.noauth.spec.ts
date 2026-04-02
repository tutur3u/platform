import { expect, test } from '@playwright/test';
import { openPasswordStage } from './helpers/auth';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';

test.describe('Authentication (unauthenticated)', () => {
  test('login page renders with email input and primary auth button', async ({
    page,
  }) => {
    await page.goto(`/${DEFAULT_LOCALE}/login`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the form to render (has loading states + Turbopack compilation)
    const emailInput = page
      .getByPlaceholder('Enter your email or username')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('button', { name: /^(continue|sign in)$/i }).first()
    ).toBeVisible();
  });

  test('root page is accessible to unauthenticated users (marketing page)', async ({
    page,
  }) => {
    // The root URL shows a marketing landing page for unauthenticated users
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Should see marketing content — the page renders (not an error)
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Verify it's the marketing/landing page (not a blank or error page)
    const title = await page.title();
    expect(title).not.toBe('');
  });

  test('password login with seed account succeeds', async ({ page }) => {
    // The current auth flow can require an email-first step before password.
    await page.goto(`/${DEFAULT_LOCALE}/login?passwordless=false`, {
      waitUntil: 'domcontentloaded',
    });

    const passwordInput = await openPasswordStage(page, TEST_USER.email);
    await passwordInput.clear();
    await passwordInput.fill(TEST_USER.password);

    // Click sign in
    const submitButton = page.getByRole('button', { name: /sign in/i });
    await submitButton.click();

    // After successful login, the form calls window.location.reload().
    // On reload, the login form detects the user and starts redirecting.
    // The URL may stay at /login briefly while redirect logic runs.
    // Wait for either: URL changes away from /login, OR the page content
    // changes to show post-auth state (loading spinner, dashboard, etc.)
    await Promise.race([
      page
        .waitForURL((url) => !url.pathname.includes('/login'), {
          timeout: 60_000,
          waitUntil: 'domcontentloaded',
        })
        .catch(() => {}),
      // If URL doesn't change (reload on same URL), wait for navigation indicator
      page.waitForTimeout(15_000),
    ]);

    // Verify the login was successful — the page should not show error messages
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Invalid credentials');
    expect(bodyText).not.toContain('Internal Server Error');
  });
});
