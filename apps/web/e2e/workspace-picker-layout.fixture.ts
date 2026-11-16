import { expect, test } from '@playwright/test';

for (const width of [390, 728, 1024, 1440]) {
  for (const locale of ['en', 'vi']) {
    test(`picker actions and badges fit at ${width}px (${locale})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?state=dialog&locale=${locale}&theme=dark`);
      const choices = page.locator('[data-workspace-choice]');
      await expect(choices).toHaveCount(7);
      const failures: string[] = [];

      for (const choice of await choices.all()) {
        await choice.scrollIntoViewIfNeeded();
        await choice.hover();
        const result = await choice.evaluate((element) => {
          const row = element.closest('[data-picker-row]') ?? element;
          const badge = row.querySelector('[data-slot="badge"]');
          if (!(badge instanceof HTMLElement)) {
            return { name: element.getAttribute('title'), errors: ['no badge'] };
          }
          const bounds = row.getBoundingClientRect();
          const plan = badge.getBoundingClientRect();
          const errors: string[] = [];
          if (bounds.width < 240) errors.push('row is narrower than 240px');
          if (bounds.left < -1 || bounds.right > innerWidth + 1) {
            errors.push('row leaves viewport');
          }
          if (plan.left < bounds.left - 1 || plan.right > bounds.right + 1) {
            errors.push('badge leaves row');
          }
          const actions = [...row.querySelectorAll('button')].filter(
            (button) => button !== element
          );
          if (!actions.length) errors.push('no workspace actions');
          for (const action of actions) {
            const box = action.getBoundingClientRect();
            const intersects =
              Math.min(plan.right, box.right) - Math.max(plan.left, box.left) >
                1 &&
              Math.min(plan.bottom, box.bottom) - Math.max(plan.top, box.top) >
                1;
            if (intersects) errors.push('action overlaps plan badge');
            if (box.left < bounds.left - 1 || box.right > bounds.right + 1) {
              errors.push('action leaves row');
            }
            if (innerWidth < 768 && (box.width < 44 || box.height < 44)) {
              errors.push('compact action is smaller than 44px');
            }
          }
          return { name: element.getAttribute('title'), errors };
        });
        failures.push(...result.errors.map((error) => `${result.name}: ${error}`));
      }
      expect(failures).toEqual([]);

      const longName = choices.filter({
        hasText: 'Northwind regional tutoring cooperative',
      });
      await longName.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const badge = longName
        .locator('..')
        .locator('[data-slot="badge"]');
      const before = await badge.boundingBox();
      await longName.hover();
      const after = await badge.boundingBox();
      expect(before).not.toBeNull();
      expect(after?.x).toBeCloseTo(before?.x ?? -1, 1);
      expect(after?.width).toBeCloseTo(before?.width ?? -1, 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
    });
  }
}
