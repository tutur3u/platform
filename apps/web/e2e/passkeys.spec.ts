import { expect, test } from '@playwright/test';
import { DASHBOARD_URL } from './helpers/constants';

test.describe('Passkeys settings', () => {
  test('renders passkey management in the account security settings dialog', async ({
    page,
  }) => {
    await page.goto(
      `${DASHBOARD_URL}?settingsDialog=open&settingsTab=security`,
      {
        waitUntil: 'domcontentloaded',
      }
    );

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Passkeys').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('button', { name: /add passkey/i })
    ).toBeVisible({ timeout: 30_000 });
  });
});
