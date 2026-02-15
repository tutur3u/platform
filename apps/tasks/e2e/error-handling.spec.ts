import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';

test.describe('Error handling (authenticated)', () => {
  test('invalid workspace ID shows appropriate response', async ({ page }) => {
    // Navigate to a non-existent workspace
    await page.goto(`/${DEFAULT_LOCALE}/non-existent-ws-id/tasks`, {
      waitUntil: 'domcontentloaded',
    });

    // Should either redirect (to onboarding/home) or show a meaningful message
    // but not crash with an unhandled error
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    // The app may redirect or show a "not found" / "not joined" message
  });

  test('non-existent board ID handles gracefully', async ({ page }) => {
    const fakeBoardId = '00000000-0000-0000-0000-000000000099';
    await page.goto(
      `/${DEFAULT_LOCALE}/personal/boards/${fakeBoardId}`,
      { waitUntil: 'domcontentloaded' }
    );

    await page.waitForLoadState('domcontentloaded');

    // Should handle gracefully — not crash
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Unhandled Runtime Error');
  });

  test('non-existent task ID handles gracefully', async ({ page }) => {
    const fakeTaskId = '00000000-0000-0000-0000-000000000099';
    await page.goto(
      `/${DEFAULT_LOCALE}/personal/tasks/${fakeTaskId}`,
      { waitUntil: 'domcontentloaded' }
    );

    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Unhandled Runtime Error');
  });

  test('invalid locale falls back gracefully', async ({ page }) => {
    await page.goto('/zz/personal/tasks', {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForLoadState('domcontentloaded');

    // Should either redirect to a valid locale or show content
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    const bodyText = await body.textContent();
    expect(bodyText).not.toContain('Internal Server Error');
  });
});
