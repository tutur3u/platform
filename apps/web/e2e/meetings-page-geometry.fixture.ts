import { expect, type Page, test } from '@playwright/test';

// Runs against packages/ui/fixtures/meetings-page (vite, port 5211):
//   bunx vite --config packages/ui/fixtures/meetings-page/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meetings-page.config.ts
// Measures computed geometry of the Meetings page controls under Sorbet, so it
// holds across platforms and font rendering.

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [390, 1100] as const;

function measure(page: Page) {
  return page.evaluate(() => {
    const errors: string[] = [];
    const near = (a: number, b: number, tolerance = 0.6) =>
      Math.abs(a - b) <= tolerance;
    const px = (value: string) => Number.parseFloat(value) || 0;
    const buttons = [...document.querySelectorAll<HTMLElement>('button')];
    const byName = (name: RegExp) =>
      buttons.find((button) =>
        name.test(
          `${button.getAttribute('aria-label') ?? ''}${button.textContent ?? ''}`
        )
      );
    const create = byName(/Create meeting/);
    const options = byName(/Meeting creation options/);
    const join = byName(/Join meeting/);
    if (!create || !options || !join) {
      errors.push('create, options or join button is missing');
      return errors;
    }
    const corners = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        topLeft: px(style.borderTopLeftRadius),
        topRight: px(style.borderTopRightRadius),
        bottomRight: px(style.borderBottomRightRadius),
        bottomLeft: px(style.borderBottomLeftRadius),
      };
    };
    const c = corners(create);
    const o = corners(options);
    const j = corners(join);
    // Outer corners match Join meeting; the seam is square.
    if (!near(c.topLeft, j.topLeft) || !near(c.bottomLeft, j.bottomLeft))
      errors.push(
        `create outer radius ${c.topLeft}/${c.bottomLeft} != join ${j.topLeft}`
      );
    if (!near(o.topRight, j.topRight) || !near(o.bottomRight, j.bottomRight))
      errors.push(
        `options outer radius ${o.topRight}/${o.bottomRight} != join ${j.topRight}`
      );
    if (c.topRight !== 0 || c.bottomRight !== 0)
      errors.push(`create seam corners are ${c.topRight}/${c.bottomRight}`);
    if (o.topLeft !== 0 || o.bottomLeft !== 0)
      errors.push(`options seam corners are ${o.topLeft}/${o.bottomLeft}`);
    const createBox = create.getBoundingClientRect();
    const optionsBox = options.getBoundingClientRect();
    const joinBox = join.getBoundingClientRect();
    if (!near(createBox.right, optionsBox.left))
      errors.push(`halves are ${optionsBox.left - createBox.right}px apart`);
    for (const box of [optionsBox, joinBox])
      if (!near(box.height, createBox.height))
        errors.push(`control height ${box.height} != ${createBox.height}`);
    if (px(getComputedStyle(options).borderLeftWidth) !== 1)
      errors.push('seam divider is not 1px');
    if (joinBox.left - optionsBox.right < 8)
      errors.push('split button and Join are closer than 8px');

    // Past filter: a segmented control with a gap from the search box.
    const search = document.querySelector<HTMLElement>('input[type="search"]');
    const track = document.querySelector<HTMLElement>(
      '[data-slot="toggle-group"]'
    );
    if (!search || !track) {
      errors.push('past search or filter is missing');
      return errors;
    }
    const searchBox = search.getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    const sideBySide = trackBox.top < searchBox.bottom;
    if (sideBySide) {
      if (trackBox.left - searchBox.right < 8)
        errors.push(
          `filter is ${trackBox.left - searchBox.right}px from search`
        );
      if (!near(trackBox.height, searchBox.height))
        errors.push(
          `filter height ${trackBox.height} != search ${searchBox.height}`
        );
    } else if (trackBox.top - searchBox.bottom < 8) {
      errors.push(
        `stacked filter is ${trackBox.top - searchBox.bottom}px below search`
      );
    }
    const items = [
      ...track.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'),
    ];
    if (items.length !== 2) errors.push(`${items.length} filter items`);
    else {
      const first = items[0]!.getBoundingClientRect();
      const second = items[1]!.getBoundingClientRect();
      if (second.left - first.right < 2)
        errors.push(`filter items are ${second.left - first.right}px apart`);
      const pad = px(getComputedStyle(track).paddingLeft);
      if (pad < 2) errors.push(`filter track padding is ${pad}px`);
    }
    return errors;
  });
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`controls hold their geometry (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?ui=sorbet&theme=${theme}&state=full&past=open`);
      await expect(
        page.getByRole('button', { name: 'Join meeting' })
      ).toBeVisible();
      expect(await measure(page)).toEqual([]);
    });

    test(`past meetings are grouped by day with icon actions (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?ui=sorbet&theme=${theme}&state=full&past=open`);
      await expect(page.getByText('Yesterday', { exact: true })).toBeVisible();
      expect(await page.locator('h3').count()).toBeGreaterThan(2);
      const actions = page.getByRole('link', {
        name: 'View notes & transcript',
      });
      await expect(actions.first()).toBeVisible();
      for (const box of await actions.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            text: node.textContent,
          };
        })
      )) {
        expect(box.text).toBe('');
        expect(Math.round(box.width)).toBe(32);
        expect(Math.round(box.height)).toBe(32);
      }
    });

    test(`an empty Upcoming offers to schedule (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?ui=sorbet&theme=${theme}&state=empty&past=open`);
      await expect(page.getByText('Nothing scheduled')).toBeVisible();
      await page
        .getByRole('button', { name: 'Schedule meeting' })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
    });
  }
}
