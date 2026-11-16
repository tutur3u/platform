import { expect, type Page, test } from '@playwright/test';

const WIDTHS = [390, 728, 1024, 1440] as const;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function open(page: Page) {
  await page.keyboard.press(`${mod}+k`);
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of WIDTHS) {
  for (const locale of ['en', 'vi'] as const) {
    test(`stays inside the viewport at ${width}px (${locale})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(`/?locale=${locale}`);
      const dialog = await open(page);
      await expect(page.locator('[cmdk-group-heading]').first()).toBeVisible();

      const geometry = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const list = element.querySelector('[data-slot="command-list"]');
        const footer = element.lastElementChild?.lastElementChild;
        return {
          bottom: box.bottom,
          footerBottom: footer?.getBoundingClientRect().bottom ?? 0,
          left: box.left,
          listOverflow: list ? getComputedStyle(list).overflowY : '',
          listScrolls: list ? list.scrollHeight > list.clientHeight : false,
          pageScrollX: document.documentElement.scrollWidth > innerWidth,
          right: box.right,
          top: box.top,
        };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(
        await page.evaluate(() => innerHeight)
      );
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.bottom + 1);
      expect(geometry.pageScrollX).toBe(false);
      expect(geometry.listScrolls).toBe(true);
      expect(geometry.listOverflow).toBe('auto');

      // Item actions stay inside the dialog: beside the list from `sm`,
      // a bottom tray below it.
      await page.keyboard.type('orchard');
      await expect(page.locator('mark').first()).toBeVisible();
      await page.keyboard.press('ArrowRight');
      const panel = page.locator('[data-slot="command-item-actions"]');
      await expect(panel).toBeVisible();
      const inside = await panel.evaluate((element) => {
        const dialogBox = element
          .closest('[data-slot="dialog-content"]')
          ?.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return (
          !!dialogBox &&
          box.left >= dialogBox.left - 1 &&
          box.right <= dialogBox.right + 1 &&
          box.bottom <= dialogBox.bottom + 1
        );
      });
      expect(inside).toBe(true);
    });
  }
}

test('one keyboard handler and one dialog for duplicated hosts', async ({
  page,
}) => {
  await page.goto('/?host=duplicate');
  const registrations = await page.evaluate(
    () =>
      (window as unknown as {
        __commandCenterKeydownRegistrations: { count: number };
      }).__commandCenterKeydownRegistrations.count
  );
  expect(registrations).toBe(1);
  await open(page);
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1);
  await expect(page.getByPlaceholder('Product launcher')).toBeVisible();
});

test('keyboard grammar and focus return', async ({ page }) => {
  await page.goto('/?host=finance-like');
  const opener = page.getByTestId('opener');
  await opener.focus();
  await open(page);
  const input = page.locator('[data-slot="dialog-content"] input');

  await page.keyboard.press('Tab');
  await expect(
    page.locator('button[aria-pressed="true"]', { hasText: 'Navigation' })
  ).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(
    page.locator('button[aria-pressed="true"]', { hasText: 'All' })
  ).toBeVisible();

  await page.keyboard.type('@');
  await expect(
    page.locator('button[aria-pressed="true"]', { hasText: 'Apps' })
  ).toBeVisible();
  const before = await page
    .locator('[cmdk-item][data-selected="true"]')
    .getAttribute('data-value');
  await page.keyboard.press('ArrowDown');
  await expect(
    page.locator('[cmdk-item][data-selected="true"]')
  ).not.toHaveAttribute('data-value', before ?? '');

  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('remote workspace errors stay in their section', async ({ page }) => {
  await page.goto('/?remote=error');
  await open(page);
  await page.keyboard.type('zeta');
  await expect(page.getByText('Could not load workspaces')).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type('cal');
  await expect(page.locator('[cmdk-item]', { hasText: 'Calendar' }).first()).toBeVisible();
});

test('offline status is announced', async ({ page, context }) => {
  await page.goto('/');
  await open(page);
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  await context.setOffline(false);
});

test('recent results, safe highlighting and follow-ups', async ({ page }) => {
  await page.goto('/');
  await open(page);
  await page.keyboard.type('finance');
  await page.keyboard.press('Enter');
  await open(page);
  await expect(page.locator('[cmdk-group-heading]', { hasText: 'Recent' })).toBeVisible();
  await expect(
    page.locator('[cmdk-item][data-value^="recent-app-finance"]')
  ).toBeVisible();

  await page.keyboard.type('img');
  await expect(page.locator('[data-slot="dialog-content"] img')).toHaveCount(0);
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);

  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type('qqqqzz');
  await expect(page.locator('[data-command-empty-note]')).toBeVisible();
  await expect(page.locator('[data-command-fallback]')).toHaveCount(2);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type('cal');
  await expect(page.locator('[data-command-empty-note]')).toBeHidden();

  // The typed query reaches the Tasks composer as its title, never sent.
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type('Plan & ship');
  await page.locator('[data-command-fallback]', { hasText: 'Create task' }).click();
  const navigations = await page.evaluate(
    () =>
      (window as unknown as { __commandCenterNavigations: string[] })
        .__commandCenterNavigations
  );
  const target = new URL(navigations.at(-1) ?? '');
  expect(target.pathname.endsWith('/tasks/new')).toBe(true);
  expect(target.searchParams.get('title')).toBe('Plan & ship');
});

test('anonymous hosts list apps without follow-ups or workspace requests', async ({
  page,
}) => {
  await page.goto('/?actor=0');
  await open(page);
  await page.keyboard.type('qqqqzz');
  await expect(page.locator('[data-command-fallback]')).toHaveCount(0);
  await expect(page.locator('[data-command-empty-note]')).toHaveCount(0);
  const requests = await page.evaluate(
    () =>
      (window as unknown as { __commandCenterRequests: string[] })
        .__commandCenterRequests
  );
  expect(requests).toEqual([]);
});

test('measurement harness: 20 samples, median and p95', async ({ page }) => {
  test.skip(!process.env.COMMAND_CENTER_MEASURE, 'set COMMAND_CENTER_MEASURE=1');
  await page.goto('/');
  await page.addScriptTag({
    path:
      process.env.COMMAND_CENTER_HARNESS ??
      '../../packages/satellite/fixtures/command-center/measure-command-center.js',
  });
  const result = await page.evaluate(() =>
    (window as unknown as {
      measureCommandCenter: (options: object) => Promise<unknown>;
    }).measureCommandCenter({ samples: 20, query: 'finan' })
  );
  test.info().attach('command-center-measurements', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
});
