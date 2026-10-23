import { expect, test } from '@playwright/test';
import { DASHBOARD_URL } from './helpers/constants';

test.describe('Settings dialog deep links', () => {
  test('opens from a bare settingsTab link and syncs the URL both ways', async ({
    page,
  }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.goto(`${DASHBOARD_URL}?settingsTab=security`, {
      waitUntil: 'domcontentloaded',
    });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('Passkeys').first()).toBeVisible({
      timeout: 30_000,
    });

    await dialog
      .getByRole('button', { name: /^sessions$/i })
      .first()
      .click();
    await expect(page).toHaveURL(/settingsTab=sessions/);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/settingsTab=|settingsDialog=/);
  });

  test('closes on Back after opening from the page', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma'
    );

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/settingsDialog=open/);

    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/settingsDialog=/);
  });
});
