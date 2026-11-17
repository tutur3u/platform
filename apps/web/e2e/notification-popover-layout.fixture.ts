import { expect, type Page, test } from '@playwright/test';

// Runs against packages/ui/fixtures/notification-popover (vite, port 5198):
//   bunx vite --config packages/ui/fixtures/notification-popover/vite.config.ts
//   bunx playwright test -c apps/web/playwright.notification-popover.config.ts

const WIDTHS = [390, 728, 1024, 1440] as const;
const HEIGHT = 800;

async function openPopover(page: Page, query: string, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(`/?${query}`);
  const bell = page.getByRole('button', { name: /^Notifications|^Thông báo/ });
  await expect(bell).toBeEnabled();
  await bell.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-notification-row]').first()).toBeVisible();
  return { bell, dialog };
}

/** Geometry and hit-area failures for the open popover, as readable strings. */
function measure(page: Page, anchor: 'sidebar' | 'navbar') {
  return page.evaluate((anchor) => {
    const errors: string[] = [];
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const box = dialog.getBoundingClientRect();
    const bell = document
      .querySelector('[aria-haspopup="dialog"]')!
      .getBoundingClientRect();
    if (box.left < -1 || box.right > innerWidth + 1)
      errors.push('popover leaves the viewport horizontally');
    if (box.top < -1 || box.bottom > innerHeight + 1)
      errors.push('popover leaves the viewport vertically');
    if (box.height > Math.min(600, innerHeight - 24) + 1)
      errors.push(`popover is ${box.height}px tall`);
    if (dialog.scrollWidth > dialog.clientWidth + 1)
      errors.push('popover scrolls horizontally');

    if (anchor === 'sidebar' && innerWidth >= 768) {
      const rail = document
        .querySelector('[data-fixture-rail]')!
        .getBoundingClientRect();
      if (box.left < rail.right - 1) errors.push('popover covers the rail');
    } else if (anchor === 'sidebar') {
      if (box.bottom > bell.top + 1) errors.push('popover covers the bell');
    } else if (box.top < bell.bottom - 1) {
      errors.push('popover does not open below the navbar bell');
    }

    const list = dialog.querySelector<HTMLElement>(
      '[data-notification-scroll]'
    )!;
    if (list.scrollHeight <= list.clientHeight)
      errors.push('list is not the scroller');
    list.scrollTop = list.scrollHeight;
    const title = dialog.querySelector('h2')!.getBoundingClientRect();
    const footer = dialog.querySelector('a[href]')!.getBoundingClientRect();
    if (title.top < box.top - 1 || title.bottom > box.bottom + 1)
      errors.push('header scrolled out of the popover');
    if (footer.top < box.top - 1 || footer.bottom > box.bottom + 1)
      errors.push('footer scrolled out of the popover');
    list.scrollTop = 0;

    for (const toggle of dialog.querySelectorAll<HTMLElement>(
      '[data-notification-toggle]'
    )) {
      const rect = toggle.getBoundingClientRect();
      const style = getComputedStyle(toggle);
      if (rect.width < 44 || rect.height < 44)
        errors.push(`read toggle hit area ${rect.width}x${rect.height}`);
      if (style.opacity === '0' || style.visibility === 'hidden')
        errors.push('read toggle is hidden');
      if (!toggle.getAttribute('aria-label'))
        errors.push('read toggle has no name');
      if (rect.right > box.right + 1) errors.push('read toggle is clipped');
    }
    return errors;
  }, anchor);
}

for (const width of WIDTHS) {
  for (const anchor of ['sidebar', 'navbar'] as const) {
    for (const locale of ['en', 'vi']) {
      test(`${anchor} popover fits at ${width}px (${locale})`, async ({
        page,
      }) => {
        const { bell } = await openPopover(
          page,
          `anchor=${anchor}&locale=${locale}`,
          width
        );
        expect(await measure(page, anchor)).toEqual([]);

        // Keyboard: the first row holds focus; Escape returns it to the bell.
        await expect(
          page.locator('[data-notification-row]').first()
        ).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(
          page.locator('[data-notification-row]').nth(1)
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
        await expect(bell).toBeFocused();
      });
    }
  }
}

for (const width of [390, 1440]) {
  test(`mark all read offers a reachable undo at ${width}px`, async ({
    page,
  }) => {
    const { bell } = await openPopover(page, 'anchor=navbar&locale=en', width);
    const rows = page.locator('[data-notification-row]');
    const before = await rows.count();
    const unreadName = await bell.getAttribute('aria-label');
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByText('You’re all caught up')).toBeVisible();
    // Focus stays inside the dialog after the button leaves.
    await expect(page.getByRole('dialog')).toBeFocused();

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    const box = (await undo.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // The toast sits outside the popover, so using it closes the popover.
    await undo.click();
    await expect(page.getByText('Restored as unread')).toBeVisible();
    await expect(bell).toHaveAttribute('aria-label', unreadName!);
    await bell.click();
    await expect(rows).toHaveCount(before);
  });
}
