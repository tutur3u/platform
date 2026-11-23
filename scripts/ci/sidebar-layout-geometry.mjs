// Icon-position comparison helpers for sidebar-layout-shift.mjs.

// Icons must hold the exact same position (sub-pixel rounding only).
export const ICON_TOLERANCE = 0.01;
// Extras anchored to the top of the sidebar: compared on both axes. The
// bottom cluster (Settings, account avatar) is compared on x only: it stacks
// vertically in the rail but lays out as a row in the panel.
export const TOP_ANCHORED = new Set(['workspaceAvatar']);
export const BOTTOM_CLUSTER = new Set(['settings', 'accountAvatar']);

export const moved = (a, b, xOnly = false) =>
  !a ||
  !b ||
  Math.abs(a.x - b.x) > ICON_TOLERANCE ||
  (!xOnly && Math.abs(a.y - b.y) > ICON_TOLERANCE) ||
  Math.abs(a.width - b.width) > ICON_TOLERANCE ||
  Math.abs(a.height - b.height) > ICON_TOLERANCE;

/** Largest per-icon shift between the resting rail and the open panel. */
export const maxShift = (a, b, xOnly = new Set()) =>
  Math.max(
    0,
    ...Object.keys(a)
      .filter((key) => b[key])
      .map((key) =>
        Math.max(
          Math.abs(a[key].x - b[key].x),
          xOnly.has(key) ? 0 : Math.abs(a[key].y - b[key].y)
        )
      )
  );

/**
 * Icon positions across viewport widths and both themes: the rail and the open
 * panel must agree on every icon, avatar and the logo.
 */
export async function measureIconMatrix(page) {
  const matrix = [];
  const flat = (g) => ({
    ...g.icons,
    ...g.extras,
    logo: g.logo ?? { x: 0, y: 0 },
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark');
      document.documentElement.style.colorScheme = value;
    }, theme);
    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(900, 450);
      await page.waitForTimeout(500);
      const resting = await page.evaluate(() => window.__geometry());
      await page.mouse.move(24, 400);
      await page.locator('aside[data-overlay-state="open"]').waitFor();
      await page.waitForTimeout(600);
      const open = await page.evaluate(() => window.__geometry());
      matrix.push({
        theme,
        width,
        measured:
          Object.keys(resting.icons).length +
          Object.keys(resting.extras).length,
        maxShiftPx: Number(
          maxShift(flat(resting), flat(open), BOTTOM_CLUSTER).toFixed(4)
        ),
      });
      await page.mouse.move(900, 450);
      await page.waitForFunction(
        () => !document.querySelector('aside').dataset.overlayState
      );
    }
  }
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  return matrix;
}
