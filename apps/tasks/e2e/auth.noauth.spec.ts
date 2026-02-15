import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';

test.describe('Tasks app - unauthenticated access', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Attempting to access a workspace page without auth should redirect
    await page.goto(`/${DEFAULT_LOCALE}/personal/tasks`, {
      waitUntil: 'domcontentloaded',
    });

    // Should be redirected to login page (on web app or tasks app login route)
    await page.waitForURL(
      (url) => url.pathname.includes('/login') || url.pathname === '/',
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Page should render without errors
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('root page is accessible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Should either show a landing page or redirect to login
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Should not show error pages
    const bodyText = await body.textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Application error');
  });
});
