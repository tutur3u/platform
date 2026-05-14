import { expect, test } from '@playwright/test';

test.describe('Hive landing page', () => {
  test('allows visitors to scroll past the hero', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('link', { name: /Continue with Tuturuuu/i })
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    expect(dimensions.bodyOverflowY).not.toBe('hidden');
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.innerHeight);

    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
  });
});
