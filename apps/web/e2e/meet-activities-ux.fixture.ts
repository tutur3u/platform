import { expect, test } from '@playwright/test';

// Runs against packages/meet-core/fixtures/meet-activities (vite, port 5213):
//   bunx vite --config packages/meet-core/fixtures/meet-activities/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meet-activities.config.ts

test('shared doc caret flips below near toolbar, dark-mode focused pane ring is subtle, and Q&A has one window control set', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet', { waitUntil: 'networkidle' });

  // 1. Multiplayer cursor label near the top flips below the caret and clears the toolbar.
  const topLabel = page.locator(
    '.collaboration-carets__label[data-user-id="vmkhoiii"]'
  );
  const lowerLabel = page.locator(
    '.collaboration-carets__label[data-user-id="alex"]'
  );
  await expect(topLabel).toBeVisible();
  await expect(topLabel).toHaveAttribute('data-placement', 'bottom');
  await expect(lowerLabel).toHaveAttribute('data-placement', 'top');

  const geometry = await page.evaluate(() => {
    const toolbar = document
      .querySelector('[data-testid="doc-toolbar"]')!
      .getBoundingClientRect();
    const label = document
      .querySelector('.collaboration-carets__label[data-user-id="vmkhoiii"]')!
      .getBoundingClientRect();
    return { toolbarBottom: toolbar.bottom, labelTop: label.top };
  });
  expect(geometry.labelTop).toBeGreaterThanOrEqual(geometry.toolbarBottom);

  // 2. Dark mode focused Q&A pane uses subtle token border/ring (no thick bright ring-2).
  const qaPane = page.locator('section[data-pane-id][aria-label="Q&A"]');
  await expect(qaPane).toHaveAttribute('data-focused', 'true');
  const paneClasses = await qaPane.getAttribute('class');
  expect(paneClasses).not.toContain('ring-2');
  expect(paneClasses).not.toContain('border-ring');
  expect(paneClasses).toContain('ring-1');

  // 3. Q&A pane header has one consistent set of window controls (no duplicate fullscreen/expand).
  await expect(qaPane.getByRole('button', { name: /^Maximize / })).toHaveCount(
    1
  );
  await expect(qaPane.getByRole('button', { name: 'Full screen' })).toHaveCount(
    0
  );
  await expect(qaPane.getByRole('button', { name: /^Close / })).toHaveCount(1);

  // 4a. Non-host close opens a popover with "Close for me" only (no native dialog).
  let nativeDialog = false;
  page.on('dialog', () => {
    nativeDialog = true;
  });
  await qaPane.getByRole('button', { name: 'Close Q&A' }).click();
  await expect(
    page.getByRole('button', { name: 'Close for me' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close for everyone' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close for me' }).click();
  await expect(qaPane).toHaveCount(0);
  expect(nativeDialog).toBe(false);
});

test('host close popover offers both Close for me and Close for everyone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet&role=host', {
    waitUntil: 'networkidle',
  });

  const qaPane = page.locator('section[data-pane-id][aria-label="Q&A"]');
  await qaPane.getByRole('button', { name: 'Close Q&A' }).click();
  await expect(
    page.getByRole('button', { name: 'Close for me' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close for everyone' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close for everyone' }).click();
  await expect(qaPane).toHaveCount(0);
  const closed = await page.evaluate(
    () =>
      (window as unknown as { __closedForEveryone?: string[] })
        .__closedForEveryone ?? []
  );
  expect(closed).toEqual(['tool:live-qa']);
});
