import { expect, test } from '@playwright/test';
import { DASHBOARD_URL } from './helpers/constants';

test.describe('Navigation (authenticated)', () => {
  test('sidebar renders with navigation items', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Wait for dashboard to load
    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // The sidebar navigation uses role="navigation" — wait for it to render
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    const navLinks = nav.getByRole('link');
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThan(0);
  });

  test('clicking a navigation link changes the URL', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Wait for dashboard to load
    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    const initialUrl = page.url();
    const initialPath = new URL(initialUrl).pathname;

    // Find navigation links in the sidebar — wait for nav to render first
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    const navLinks = nav.getByRole('link');
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });
    const count = await navLinks.count();

    let clicked = false;
    if (count > 0) {
      // Click the first visible navigation link that points to a different path
      for (let i = 0; i < count; i++) {
        const link = navLinks.nth(i);
        const href = await link.getAttribute('href');
        const isVisible = await link.isVisible();

        if (
          href &&
          isVisible &&
          !href.startsWith('#') &&
          href !== '/' &&
          href !== initialPath
        ) {
          await link.click();
          // Next.js uses client-side navigation (History API) so
          // waitForLoadState won't detect URL changes. Wait for URL to update.
          await page.waitForURL((url) => url.pathname !== initialPath, {
            timeout: 30_000,
          });

          const newUrl = page.url();
          expect(newUrl).not.toBe(initialUrl);
          clicked = true;
          break;
        }
      }
    }

    // If no suitable link was found, skip gracefully
    if (!clicked) {
      test.skip(true, 'No suitable navigation link found to click');
    }
  });

  test('page does not show error state', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    await page.waitForLoadState('domcontentloaded');

    // Should not contain common error indicators
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Application error');
  });
});
