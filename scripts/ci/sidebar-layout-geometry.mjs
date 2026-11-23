import assert from 'node:assert/strict';
import path from 'node:path';

// Icon-position comparison helpers for sidebar-layout-shift.mjs.

// Icons must hold the exact same position (sub-pixel rounding only).
export const ICON_TOLERANCE = 0.01;
export const moved = (a, b) =>
  !a ||
  !b ||
  Math.abs(a.x - b.x) > ICON_TOLERANCE ||
  Math.abs(a.y - b.y) > ICON_TOLERANCE ||
  Math.abs(a.width - b.width) > ICON_TOLERANCE ||
  Math.abs(a.height - b.height) > ICON_TOLERANCE;

/** Largest per-icon shift between the resting rail and the open panel. */
export const maxShift = (a, b) =>
  Math.max(
    0,
    ...Object.keys(a)
      .filter((key) => b[key])
      .map((key) =>
        Math.max(Math.abs(a[key].x - b[key].x), Math.abs(a[key].y - b[key].y))
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
        maxShiftPx: Number(maxShift(flat(resting), flat(open)).toFixed(4)),
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

/**
 * The footer is Settings and the account avatar only. Notifications, Upgrade
 * and Feedback live in the avatar menu, and the avatar carries the unread
 * count in its badge and accessible name.
 */
export async function checkAccountHub(page, shots) {
  const aside = page.locator('aside');
  assert.equal(
    await aside
      .getByRole('button', { name: /^(Feedback|Upgrade|Notifications)/ })
      .count(),
    0,
    'the footer has no Feedback, Upgrade or Notifications controls'
  );
  await page.mouse.move(900, 450);
  await page.waitForTimeout(500);
  const rail = aside.getByRole('button', { name: 'Account, 3 unread' });
  await rail.waitFor();
  assert.equal(
    await rail.locator('[data-slot="account-unread-badge"]').textContent(),
    '3',
    'the rail avatar shows the unread count'
  );
  await page.mouse.move(24, 400);
  await page.locator('aside[data-overlay-state="open"]').waitFor();
  await page.waitForTimeout(500);
  const account = aside.getByRole('button', { name: 'Account, 3 unread' });
  await account.click();
  const menu = page.getByRole('menu');
  for (const name of [/^Notifications/, /^Upgrade/, /^Feedback/]) {
    await menu.getByRole('menuitem', { name }).waitFor();
  }
  await page.waitForTimeout(300);
  if (shots)
    await page.screenshot({ path: path.join(shots, '6-account-menu.png') });
  await menu.getByRole('menuitem', { name: /^Notifications/ }).click();
  await page.getByTestId('notifications-panel').waitFor();
  // The pointer is on the menu, outside the sidebar: the sidebar stays open
  // through the menu-to-popover hand-off and while the popover is open.
  await page.waitForTimeout(900);
  assert.equal(
    await page.locator('aside[data-overlay-state="open"]').count(),
    1,
    'the hover sidebar stays open while Notifications is open'
  );
  assert.equal(
    await page.getByTestId('notifications-panel').isVisible(),
    true,
    'the notifications popover is still open'
  );
  if (shots)
    await page.screenshot({ path: path.join(shots, '7-notifications.png') });
  // The pointer stays on the sidebar, as it does when the avatar is clicked.
  await page.mouse.move(24, 420);
  await page.keyboard.press('Escape');
  await page.getByTestId('notifications-panel').waitFor({ state: 'hidden' });
  await page.waitForTimeout(200);
  const focused = await page.evaluate(
    () => document.activeElement?.outerHTML.slice(0, 160) ?? ''
  );
  assert.match(
    focused,
    /aria-label="Account/,
    `focus returns to the avatar after the notifications close (was ${focused})`
  );
  await page.mouse.move(900, 450);
  await page.waitForTimeout(400);
}
