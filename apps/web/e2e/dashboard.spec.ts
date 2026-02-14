import { expect, test } from '@playwright/test';
import { DASHBOARD_URL } from './helpers/constants';

test.describe('Dashboard (authenticated)', () => {
  test('loads workspace dashboard for authenticated user', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // After auth, we should land on a workspace page (not login or error)
    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        return !path.includes('/login') && !path.includes('/auth');
      },
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Page should have meaningful content — not a blank error page
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // The page title should be set (not the default Next.js error title)
    const title = await page.title();
    expect(title).not.toBe('');
  });

  test('workspace page contains navigation elements', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Wait for the page to be fully loaded past any redirects
    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // The sidebar uses role="navigation" — use Playwright's role-based locator
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    // Should have at least one navigation link inside the nav region
    const navLinks = nav.getByRole('link');
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });
  });
});
