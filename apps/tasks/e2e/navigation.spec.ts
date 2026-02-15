import { expect, test } from '@playwright/test';
import { DASHBOARD_URL } from './helpers/constants';

test.describe('Navigation (authenticated)', () => {
  test('sidebar renders with navigation items', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    const navLinks = nav.getByRole('link');
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThan(0);
  });

  test('clicking a navigation link changes the URL', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    const initialUrl = page.url();
    const initialPath = new URL(initialUrl).pathname;

    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    const navLinks = nav.getByRole('link');
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });
    const count = await navLinks.count();

    let clicked = false;
    if (count > 0) {
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
          // Next.js uses client-side navigation (History API)
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

    if (!clicked) {
      test.skip(true, 'No suitable navigation link found to click');
    }
  });

  test('sidebar contains expected task management links', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    // The tasks app sidebar should contain links to key task management sections
    const navLinks = nav.getByRole('link');
    const linkCount = await navLinks.count();

    const hrefs: string[] = [];
    for (let i = 0; i < linkCount; i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      if (href) hrefs.push(href);
    }

    // Verify key sections are linked in the navigation
    const expectedSections = [
      '/tasks',
      '/boards',
      '/projects',
      '/labels',
      '/notes',
    ];

    for (const section of expectedSections) {
      const found = hrefs.some((href) => href.includes(section));
      expect(
        found,
        `Expected navigation to contain a link with "${section}"`
      ).toBe(true);
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

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Application error');
  });
});
