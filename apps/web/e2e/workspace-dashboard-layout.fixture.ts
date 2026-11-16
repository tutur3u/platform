import { expect, type Page, test } from '@playwright/test';
import {
  DASHBOARD_VIEWPORTS,
  dashboardViolations,
  expectDashboardGeometry,
} from './helpers/dashboard-geometry-probe';

/*
 * Standalone fixture (packages/ui/fixtures/workspace-dashboard): the shared
 * layout and production cards with synthetic in-memory data. It proves
 * layout and client card behavior only; deployed server auth, Finance
 * forwarding and the real Mira panel are covered by dashboard-layout.spec.ts
 * against the running app.
 */
const STATES = ['ready', 'loading', 'error', 'partial'] as const;
const UIS = ['classic', 'sorbet'] as const;

async function open(page: Page, query: string) {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') outside.push(request.url());
  });
  await page.goto(`/?${query}`);
  await expect(page.locator('[data-dashboard-layout]')).toBeVisible();
  return outside;
}

async function settle(page: Page, state: (typeof STATES)[number]) {
  const cards = page.locator('[data-dashboard-layout] [data-dashboard-card]');
  if (state === 'loading') {
    await expect(cards.locator('[role="status"]').first()).toBeVisible();
    return;
  }
  await expect(cards.locator('[role="status"]')).toHaveCount(0);
  if (state === 'error' || state === 'partial') {
    await expect(cards.locator('[role="alert"]').first()).toBeVisible();
  }
}

for (const width of DASHBOARD_VIEWPORTS) {
  for (const ui of UIS) {
    for (const state of STATES) {
      test(`fixture ${state} (${ui}) holds its layout at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const outside = await open(page, `ui=${ui}&state=${state}&theme=light&names=long`);
        await settle(page, state);

        await expectDashboardGeometry(page, 900);
        expect(outside).toEqual([]);
        expect(await page.evaluate(() => (window as unknown as { __fixtureUnexpected: string[] }).__fixtureUnexpected)).toEqual([]);
      });
    }
  }
}

test('the probe fails on the squeezed side-rail layout it guards against', async ({ page }) => {
  await page.setViewportSize({ width: 728, height: 900 });
  await open(page, 'ui=classic&state=ready&names=long');
  await settle(page, 'ready');
  // Recreate the original defect: rail pinned beside a squeezed main column.
  await page.addStyleTag({
    content:
      '[data-dashboard-layout] > div { grid-template-columns: minmax(0,1fr) 340px !important; }' +
      '[data-dashboard-region="rail"] { grid-column: 2 !important; grid-row: 1 / span 2 !important; }',
  });

  const { violations } = await dashboardViolations(page);
  expect(violations.length).toBeGreaterThan(0);
  expect(violations.join('\n')).toMatch(/rail beside, expected below|wide|overlaps|escapes/);
});

test('Sorbet dark at phone width keeps the dock above the app dock', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'ui=sorbet&theme=dark&state=ready&names=long');
  await settle(page, 'ready');
  await expect(page.locator('[data-slot="mobile-dock"]')).toBeVisible();
  await expectDashboardGeometry(page, 844);
});
