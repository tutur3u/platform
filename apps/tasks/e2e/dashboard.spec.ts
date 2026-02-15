import { expect, test } from '@playwright/test';
import { DASHBOARD_URL, TASKS_URL } from './helpers/constants';

test.describe('Tasks dashboard (authenticated)', () => {
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

    // Page should have meaningful content
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // The page title should be set
    const title = await page.title();
    expect(title).not.toBe('');
  });

  test('tasks page loads successfully', async ({ page }) => {
    await page.goto(TASKS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Page should render without errors
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    const bodyText = await body.textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Application error');
  });

  test('workspace page contains navigation elements', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // The sidebar uses role="navigation"
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    // Should have at least one navigation link
    const navLinks = nav.getByRole('link');
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });
  });
});
