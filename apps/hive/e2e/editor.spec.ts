import { expect, type Page, test } from '@playwright/test';
import { authenticateHiveTestUser } from './helpers/auth';

test.describe('Hive editor chrome', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await authenticateHiveTestUser(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('canvas').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-hive-ready="true"]')).toBeAttached({
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
    await page.getByRole('button', { exact: true, name: 'Build' }).click();
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

    await page.getByRole('button', { name: 'Live operations' }).click();
    await expect(page.getByText('Live operations')).toBeVisible();
    await expect(page.getByText('Revision')).toBeVisible();
  });

  test('toggles agent chat and mini-map chrome', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Hive top toolbar' }).hover();
    await expect(page.getByLabel('World agent prompt')).not.toBeVisible();
    await page.getByRole('button', { name: 'Open agent chat' }).click();
    await expect(page.getByLabel('World agent prompt')).toBeVisible();
    await page.getByRole('button', { name: 'Close agent chat' }).click();
    await expect(page.getByLabel('World agent prompt')).not.toBeVisible();

    const miniMap = page.getByRole('region', { name: 'Hive mini-map' });
    await expect(miniMap).toBeVisible();
    await page.getByRole('button', { name: 'Toggle mini-map' }).click();
    await expect(miniMap).not.toBeVisible();
    await page.getByRole('button', { name: 'Toggle mini-map' }).click();
    await expect(miniMap).toBeVisible();
  });

  test('removes hidden toolbar hit targets when the dock is collapsed', async ({
    page,
  }) => {
    const selectButton = page.getByRole('button', {
      exact: true,
      name: 'Select',
    });
    const box = await selectButton.boundingBox();
    expect(box).not.toBeNull();

    await page.getByRole('toolbar', { name: 'Hive tool dock' }).hover();
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
    await selectVisibleWorldItem(page);
    await expect(page.getByText('Inspector')).toBeVisible();

    await page.getByRole('toolbar', { name: 'Hive top toolbar' }).hover();
    await page.getByRole('button', { name: 'Toggle inspector' }).click();
    await expect(page.getByText('Inspector')).not.toBeVisible();
    await page.getByRole('button', { name: 'Toggle inspector' }).click();
    await expect(page.getByText('Inspector')).toBeVisible();

    await page.getByRole('toolbar', { name: 'Hive top toolbar' }).hover();
    await page.getByRole('button', { name: 'Toggle NPC lab' }).click();
    await expect(page.getByText('NPC Lab')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle NPC lab' }).click();
    await expect(page.getByText('NPC Lab')).not.toBeVisible();

    await expect(
      page.getByRole('button', { exact: true, name: 'Select' })
    ).toBeVisible();
  });

  test('creates and manually runs a graph workflow', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Hive top toolbar' }).hover();
    await page.getByRole('button', { name: 'Workflow graph' }).click();

    await expect(page.getByText('Workflow parts')).toBeVisible();
    await page.getByRole('button', { name: 'Simulation tick' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Workflow saved')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByText('Latest run')).toBeVisible();
    await expect(page.getByText(/completed|failed/)).toBeVisible({
      timeout: 20_000,
    });
  });
});

async function selectVisibleWorldItem(page: Page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  if (!box) return;

  const clickTargets = [
    [0.5, 0.52],
    [0.46, 0.5],
    [0.54, 0.5],
    [0.5, 0.58],
    [0.42, 0.56],
    [0.58, 0.56],
  ];

  for (const [x, y] of clickTargets) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);

    if (await page.getByText('Inspector').isVisible()) {
      return;
    }
  }

  await expect(page.getByText('Inspector')).toBeVisible();
}
