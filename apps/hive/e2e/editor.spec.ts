import { expect, test } from '@playwright/test';
import { authenticateHiveTestUser } from './helpers/auth';

test.describe('Hive editor chrome', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateHiveTestUser(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('canvas').first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test('renders the compact editor shell without title or helper chrome', async ({
    page,
  }) => {
    await expect(page.getByText('Hive World Builder')).not.toBeVisible();
    await expect(page.getByText(/Tap to place/i)).not.toBeVisible();
    await expect(page.getByLabel(/connection$/)).toBeVisible();
    await expect(page.getByLabel(/\d+ blocks?/)).toBeVisible();
    await expect(page.getByLabel(/\d+ objects?/)).toBeVisible();
    await expect(page.getByLabel(/\d+ NPCs?/)).toBeVisible();
    await expect(page.getByLabel(/\d+ online/)).toBeVisible();
  });

  test('toggles dock catalog and settings panels without duplicated labels', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Build' }).click();
    await expect(page.getByRole('button', { name: 'Blocks' })).toBeVisible();

    await page.getByRole('button', { name: 'Objects' }).click();
    await expect(page.getByRole('button', { name: /House/ })).toBeVisible();

    await page.getByRole('button', { name: 'Editor settings' }).click();
    await expect(
      page.getByRole('button', { name: 'Minimal tile gaps' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Automatic 24 hour cycle' })
    ).toBeVisible();
    await expect(page.getByLabel(/Time of day/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spring' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Clear weather' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Isometric camera' })
    ).toBeVisible();
  });

  test('toggles agent chat and mini-map chrome', async ({ page }) => {
    await expect(page.getByLabel('World agent prompt')).not.toBeVisible();
    await page.getByRole('button', { name: 'Open agent chat' }).click();
    await expect(page.getByLabel('World agent prompt')).toBeVisible();
    await page.getByRole('button', { name: 'Close agent chat' }).click();
    await expect(page.getByLabel('World agent prompt')).not.toBeVisible();

    await expect(page.getByLabel('Hive mini-map')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse mini-map' }).click();
    await expect(page.getByLabel('Hive mini-map')).not.toBeVisible();
    await page.getByRole('button', { name: 'Open mini-map' }).click();
    await expect(page.getByLabel('Hive mini-map')).toBeVisible();
  });

  test('removes hidden toolbar hit targets when the dock is collapsed', async ({
    page,
  }) => {
    const selectButton = page.getByRole('button', { name: 'Select' });
    const box = await selectButton.boundingBox();
    expect(box).not.toBeNull();

    await page.getByRole('button', { name: 'Collapse tool dock' }).click();
    await expect(selectButton).not.toBeVisible();

    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }

    await expect(
      page.getByRole('tooltip', { name: 'Select' })
    ).not.toBeVisible();
  });

  test('opens and collapses inspector and NPC lab without blocking the dock', async ({
    page,
  }) => {
    await page.getByTitle('Toggle inspector').click();
    await expect(page.getByText('Inspector')).toBeVisible();
    await page.getByTitle('Collapse inspector').click();
    await expect(page.getByText('Inspector')).not.toBeVisible();

    await page.getByRole('button', { name: 'Open NPC lab' }).click();
    await expect(page.getByText('NPC Lab')).toBeVisible();
    await page.getByTitle('Collapse NPC lab').click();
    await expect(page.getByText('NPC Lab')).not.toBeVisible();

    await expect(page.getByRole('button', { name: 'Select' })).toBeVisible();
  });
});
