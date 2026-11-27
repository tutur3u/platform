import { expect, type Page, test } from '@playwright/test';

// Runs against packages/meet-core/fixtures/meet-activities (vite, port 5213),
// which mounts the real StageLayoutView, shared-document editor and presence
// components. Only the transport is local (a remote Yjs/awareness peer).
//   bunx vite --config packages/meet-core/fixtures/meet-activities/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meet-activities.config.ts

const DOC_PANE = 'section[data-pane-id][aria-label="Shared document"]';
const QA_PANE = 'section[data-pane-id][aria-label="Q&A"]';
const COLOR_CLASS =
  /\b(?:ring|border|bg|text)-(?:red|blue|green|sky|indigo|violet|purple|pink|amber|yellow|emerald|orange|rose|cyan|teal|lime|fuchsia)-\d{2,3}\b/;

async function stickyChromeBottom(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="doc-scroll"]');
    if (!scroller) throw new Error('shared document scroller is missing');
    const top = scroller.getBoundingClientRect().top;
    let bottom = top;
    for (const element of scroller.querySelectorAll<HTMLElement>('*')) {
      if (getComputedStyle(element).position !== 'sticky') continue;
      const rect = element.getBoundingClientRect();
      if (rect.top <= top + 1 && rect.bottom > bottom) bottom = rect.bottom;
    }
    return bottom;
  });
}

test('multiplayer caret labels near the top flip below and clear the sticky toolbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet', { waitUntil: 'networkidle' });

  const topLabel = page.locator(
    '.collaboration-carets__label[data-user-id="u-vmkhoiii"]'
  );
  const lowerLabel = page.locator(
    '.collaboration-carets__label[data-user-id="u-alex"]'
  );
  await expect(topLabel).toBeVisible();
  await expect(topLabel).toHaveAttribute('data-placement', 'bottom');
  await expect(lowerLabel).toHaveAttribute('data-placement', 'top');

  const toolbarBottom = await stickyChromeBottom(page);
  const labelTop = await topLabel.evaluate(
    (element) => element.getBoundingClientRect().top
  );
  expect(labelTop).toBeGreaterThanOrEqual(toolbarBottom);

  // Scrolling the document keeps the flipped label clear of the toolbar.
  await page.locator('[data-testid="doc-scroll"]').evaluate((element) => {
    element.scrollTop = 4;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(topLabel).toHaveAttribute('data-placement', 'bottom');
  const scrolledTop = await topLabel.evaluate(
    (element) => element.getBoundingClientRect().top
  );
  expect(scrolledTop).toBeGreaterThanOrEqual(
    await stickyChromeBottom(page)
  );
});

test('dark-mode focused pane uses a subtle token ring, not a thick bright one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet', { waitUntil: 'networkidle' });

  const qaPane = page.locator(QA_PANE);
  await expect(qaPane).toHaveAttribute('data-focused', 'true');
  const classes = (await qaPane.getAttribute('class')) ?? '';
  expect(classes).toContain('ring-1');
  expect(classes).not.toContain('ring-2');
  expect(classes).not.toContain('border-ring');
  expect(classes).not.toMatch(COLOR_CLASS);

  // The unfocused document pane shares the same focus treatment.
  const docPane = page.locator(DOC_PANE);
  await expect(docPane).not.toHaveAttribute('data-focused', 'true');
  const docClasses = (await docPane.getAttribute('class')) ?? '';
  expect(docClasses).not.toMatch(COLOR_CLASS);
});

test('every activity pane shows one consistent set of window controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet', { waitUntil: 'networkidle' });

  for (const pane of [DOC_PANE, QA_PANE]) {
    const names = await page
      .locator(`${pane} > header button`)
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label') ?? '')
      );
    // No control appears twice in one header.
    expect(new Set(names).size).toBe(names.length);
    // Exactly one maximize and one close; no second expand/fullscreen button.
    expect(names.filter((name) => /^Maximize /.test(name))).toHaveLength(1);
    expect(names.filter((name) => /^Close /.test(name))).toHaveLength(1);
    expect(names.filter((name) => /full screen/i.test(name))).toHaveLength(0);
  }
});

test('closing an activity opens a popover; members see only "Close for me" and no native dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let nativeDialog = false;
  page.on('dialog', () => {
    nativeDialog = true;
  });
  await page.goto('/?theme=dark&ui=sorbet', { waitUntil: 'networkidle' });

  const qaPane = page.locator(QA_PANE);
  await qaPane.getByRole('button', { name: 'Close Q&A' }).click();
  await expect(page.getByRole('button', { name: 'Close for me' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close for everyone' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close for me' }).click();
  await expect(qaPane).toHaveCount(0);
  expect(nativeDialog).toBe(false);
});

test('hosts see "Close for everyone" in the same popover and it closes the activity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet&role=host', {
    waitUntil: 'networkidle',
  });

  const qaPane = page.locator(QA_PANE);
  await qaPane.getByRole('button', { name: 'Close Q&A' }).click();
  await expect(page.getByRole('button', { name: 'Close for me' })).toBeVisible();
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

test('presence shows in every activity header, on the Activities dock, and on participant tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?theme=dark&ui=sorbet', { waitUntil: 'networkidle' });

  // One presence row per activity header, using the same component.
  await expect(
    page.locator(`${DOC_PANE} [data-activity-presence="document"]`)
  ).toBeVisible();
  await expect(
    page.locator(`${QA_PANE} [data-activity-presence="tool:live-qa"]`)
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-activity-presence="tool:live-qa"] [aria-label="Alex (following)"]'
    )
  ).toBeVisible();
  await expect(page.locator('[data-activity-presence]')).toHaveCount(2);

  // Compact indicator on the Activities dock.
  await expect(page.locator('[data-activities-dock-presence]')).toBeVisible();
  await expect(
    page.locator('[data-activities-dock-presence] [aria-label]')
  ).toHaveCount(2);

  // Participant tile shows the activity the participant is in.
  await expect(
    page.locator('[data-participant-activity="Shared document"]')
  ).toBeVisible();
});
