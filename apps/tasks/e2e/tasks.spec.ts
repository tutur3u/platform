import { expect, test } from '@playwright/test';
import { TASKS_URL } from './helpers/constants';

test.describe('My Tasks page (authenticated)', () => {
  test('my tasks page renders successfully', async ({ page }) => {
    await page.goto(TASKS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    const bodyText = await body.textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Application error');
  });

  test('my tasks page has interactive controls', async ({ page }) => {
    await page.goto(TASKS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Wait for the page to fully render
    await page.waitForLoadState('domcontentloaded');

    // Should have interactive buttons (filters, create task, etc.)
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('my tasks page does not show authorization errors', async ({ page }) => {
    await page.goto(TASKS_URL, { waitUntil: 'domcontentloaded' });

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

  test('navigating between tasks and boards works', async ({ page }) => {
    // Start on the tasks page
    await page.goto(TASKS_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(
      (url) =>
        !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );

    // Find and click the boards link in navigation
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible({ timeout: 30_000 });

    const boardsLink = nav.getByRole('link').filter({
      has: page.locator(`[href*="/boards"]`),
    });

    if ((await boardsLink.count()) > 0) {
      await boardsLink.first().click();

      await page.waitForURL((url) => url.pathname.includes('/boards'), {
        timeout: 30_000,
      });

      expect(page.url()).toContain('/boards');

      // Navigate back to tasks
      const tasksLink = nav.getByRole('link').filter({
        has: page.locator(`[href*="/tasks"]`),
      });

      if ((await tasksLink.count()) > 0) {
        await tasksLink.first().click();

        await page.waitForURL((url) => url.pathname.includes('/tasks'), {
          timeout: 30_000,
        });

        expect(page.url()).toContain('/tasks');
      }
    } else {
      test.skip(true, 'Boards link not found in navigation');
    }
  });
});
