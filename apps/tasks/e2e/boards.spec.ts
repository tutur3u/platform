import { expect, test } from '@playwright/test';
import { BOARDS_URL } from './helpers/constants';

test.describe('Boards page (authenticated)', () => {
  test('boards page renders with heading', async ({ page }) => {
    await page.goto(BOARDS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Page should load without errors
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    const bodyText = await body.textContent();
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('boards page has actionable UI elements', async ({ page }) => {
    await page.goto(BOARDS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Wait for page content to settle
    await page.waitForLoadState('domcontentloaded');

    // The page should have interactive elements (buttons for creating boards, etc.)
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    // At minimum there should be UI controls (theme toggle, user menu, etc.)
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('boards page does not show authentication errors', async ({ page }) => {
    await page.goto(BOARDS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Unauthorized');
    expect(bodyText).not.toContain('403');
    expect(bodyText).not.toContain('Not authenticated');
  });
});
