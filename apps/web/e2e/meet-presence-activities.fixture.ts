import { expect, type Page, test } from '@playwright/test';

// Runs against packages/meet-core/fixtures/meet-activities (vite, port 5213)
// with ?scene=presence, mounting the real PresenceStage, PresenceLiveActivities,
// ActivityPresenceRow, and StageLayoutView on both desktop and mobile viewports.
//   bunx vite --config packages/meet-core/fixtures/meet-activities/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meet-activities.config.ts

const HARD_CODED_HUE =
  /\b(?:ring|border|bg|text)-(?:red|blue|green|sky|indigo|violet|purple|pink|amber|yellow|emerald|orange|rose|cyan|teal|lime|fuchsia)-\d{2,3}\b/;

async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

async function assertNoHardCodedHueInLiveStrip(page: Page) {
  const classes = await page
    .locator('[data-testid="presence-live-activities"] *')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('class') ?? '').join(' ')
    );
  expect(classes).not.toMatch(HARD_CODED_HUE);
}

test('desktop EN: presence-only room highlights live activities with presence badges and opens Q&A on tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=presence&locale=en&theme=dark&ui=sorbet', {
    waitUntil: 'networkidle',
  });

  const liveSection = page.getByTestId('presence-live-activities');
  await expect(liveSection).toBeVisible();
  await expect(liveSection.getByText('Live now')).toBeVisible();

  // Live cards render for active Q&A (2 people), active Shared document (1), and host-enabled Polls.
  await expect(
    liveSection.locator('[data-live-activity="tool:live-qa"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity="document"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity="tool:polls"]')
  ).toBeVisible();

  // Presence avatars and counts render on active activity cards.
  await expect(
    liveSection.locator('[data-activity-presence="tool:live-qa"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity-count="tool:live-qa"]')
  ).toHaveText('2 active');
  await expect(
    liveSection.locator('[data-activity-presence="document"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity-count="document"]')
  ).toHaveText('1 active');

  // Shared document is already highlighted above, so secondary shortcuts omit a duplicate button.
  const secondary = page.getByTestId('presence-secondary-activities');
  await expect(secondary).toBeVisible();
  await expect(
    secondary.getByRole('button', { name: 'Shared document' })
  ).toHaveCount(0);
  await expect(
    secondary.getByRole('button', { name: 'Co-programming' })
  ).toBeVisible();

  // Zero EN+VI side-by-side copy and zero hard-coded hue classes.
  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toContain('Đang diễn ra');
  expect(bodyText).not.toContain('Tham gia');
  expect(bodyText).not.toContain('Hoạt động khác');
  await assertNoHardCodedHueInLiveStrip(page);
  await assertNoHorizontalOverflow(page);

  // Clicking the highlighted live Q&A card opens the real Q&A pane.
  await liveSection.getByRole('button', { name: 'Join Q&A' }).click();
  await expect(
    page.locator('section[data-pane-id][aria-label="Q&A"]')
  ).toBeVisible();
});

test('mobile EN (390x844): presence-only live activity cards fit cleanly and open on tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?scene=presence&locale=en&theme=dark&ui=sorbet', {
    waitUntil: 'networkidle',
  });

  const liveSection = page.getByTestId('presence-live-activities');
  await expect(liveSection).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity="tool:live-qa"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity="tool:polls"]')
  ).toBeVisible();

  await assertNoHorizontalOverflow(page);

  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toContain('Đang diễn ra');
  expect(bodyText).not.toContain('Tham gia');

  await liveSection.getByRole('button', { name: 'Join Q&A' }).click();
  await expect(
    page.locator('section[data-pane-id][aria-label="Q&A"]')
  ).toBeVisible();
});

test('desktop and mobile VI: presence-only live activities render Vietnamese only and open on tap', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?scene=presence&locale=vi&theme=dark&ui=sorbet', {
      waitUntil: 'networkidle',
    });

    const liveSection = page.getByTestId('presence-live-activities');
    await expect(liveSection).toBeVisible();
    await expect(liveSection.getByText('Đang diễn ra')).toBeVisible();
    await expect(liveSection.getByText('Chủ phòng đã bật')).toBeVisible();

    // Verify no EN+VI side-by-side text appears in VI locale.
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toContain('Live now');
    expect(bodyText).not.toContain('Host enabled');
    expect(bodyText).not.toContain('More activities');
    expect(bodyText).not.toMatch(/\bJoin\b/);
    await assertNoHorizontalOverflow(page);

    await liveSection
      .locator('[data-live-activity="tool:live-qa"] button')
      .click();
    await expect(page.locator('section[data-pane-id]')).toBeVisible();
  }
});

test('restricted participant respects tool permissions and can still join shortcut Polls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(
    '/?scene=presence&locale=en&canBrowse=0&theme=dark&ui=sorbet',
    { waitUntil: 'networkidle' }
  );

  const liveSection = page.getByTestId('presence-live-activities');
  await expect(liveSection).toBeVisible();

  // Document and Q&A are visible as active in the room but omit Join/Open buttons when restricted.
  await expect(
    liveSection.locator('[data-live-activity="document"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity="document"] button')
  ).toHaveCount(0);
  await expect(
    liveSection.locator('[data-live-activity="tool:live-qa"]')
  ).toBeVisible();
  await expect(
    liveSection.locator('[data-live-activity="tool:live-qa"] button')
  ).toHaveCount(0);

  // Polls shortcut remains joinable and opens the Polls pane.
  await liveSection.getByRole('button', { name: 'Join Polls' }).click();
  await expect(
    page.locator('section[data-pane-id][aria-label="Polls"]')
  ).toBeVisible();
  await expect(page.getByTestId('presence-opened-polls')).toBeVisible();
});

test('empty presence scene falls back to roster shortcuts without More activities heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=presence&locale=en&empty=1&theme=dark&ui=sorbet', {
    waitUntil: 'networkidle',
  });

  await expect(page.getByTestId('presence-live-activities')).toHaveCount(0);
  await expect(page.getByText('More activities')).toHaveCount(0);

  const secondary = page.getByTestId('presence-secondary-activities');
  await expect(secondary).toBeVisible();
  await expect(
    secondary.getByRole('button', { name: 'Co-programming' })
  ).toBeVisible();
  await expect(
    secondary.getByRole('button', { name: 'Shared document' })
  ).toBeVisible();
});
