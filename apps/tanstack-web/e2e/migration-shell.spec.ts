import { expect, test } from '@playwright/test';

test('renders the migration shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'TanStack Start + Rust readiness' })
  ).toBeVisible();
  await expect(page.getByText('Cutover gates')).toBeVisible();
  await expect(page.getByText('Benchmark compare')).toBeVisible();

  if (process.env.TANSTACK_EXPECT_BACKEND_REACHABLE === '1') {
    await expect(page.getByText('Backend reachable')).toBeVisible();
  }

  if (process.env.TANSTACK_EXPECT_BACKEND_TARGET) {
    await expect(
      page.getByText(process.env.TANSTACK_EXPECT_BACKEND_TARGET, {
        exact: true,
      })
    ).toBeVisible();
  }
});
