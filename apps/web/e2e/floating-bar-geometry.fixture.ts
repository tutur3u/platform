import { expect, type Page, test } from '@playwright/test';

// Runs against packages/ui/fixtures/floating-bar (vite, port 5199):
//   bunx vite --config packages/ui/fixtures/floating-bar/vite.config.ts
//   bunx playwright test -c apps/web/playwright.floating-bar.config.ts
// Measures computed geometry, so it holds across platforms and font
// rendering, and attaches a screenshot of every variant for review.

const VARIANTS = [
  'theme=light',
  'theme=dark',
  'theme=light&ui=sorbet',
  'theme=dark&ui=sorbet',
] as const;

/** Concentric-corner failures for every bar and segmented track. */
function measure(page: Page) {
  return page.evaluate(() => {
    const errors: string[] = [];
    const px = (value: string) => Number.parseFloat(value) || 0;
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.6;
    const radii: Record<string, number> = {};

    for (const bar of document.querySelectorAll<HTMLElement>(
      '[data-slot="floating-bar"]'
    )) {
      const name = bar.dataset.fixture ?? 'bar';
      const style = getComputedStyle(bar);
      const box = bar.getBoundingClientRect();
      const pads = [
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft,
      ].map(px);
      const pad = pads[0]!;
      if (pads.some((p) => !near(p, pad)))
        errors.push(`${name}: padding ${pads.join('/')} is not equal`);
      if (px(style.borderTopWidth) > 0)
        errors.push(`${name}: has a layout border`);
      const outer = Math.min(px(style.borderTopLeftRadius), box.height / 2);
      radii[name] = outer;
      const controlHeight =
        bar.querySelector('[data-slot="button"]')?.getBoundingClientRect()
          .height ?? 0;
      // A bar that wraps onto several rows keeps its radius but not one row.
      const wrapped = box.height > controlHeight + 2 * pad + 1;

      const buttons = [
        ...bar.querySelectorAll<HTMLElement>('[data-slot="button"]'),
      ];
      const heights = new Set(
        buttons.map((b) => Math.round(b.getBoundingClientRect().height))
      );
      if (heights.size !== 1)
        errors.push(`${name}: control heights ${[...heights].join(', ')}`);
      for (const button of buttons) {
        const r = button.getBoundingClientRect();
        const inner = Math.min(
          px(getComputedStyle(button).borderTopLeftRadius),
          r.height / 2
        );
        if (!near(inner, outer - pad))
          errors.push(
            `${name}: control radius ${inner} ≠ ${outer} − ${pad} (${button.textContent || button.getAttribute('aria-label')})`
          );
        if (button.dataset.size === 'icon' && !near(r.width, r.height))
          errors.push(`${name}: icon control is ${r.width}×${r.height}`);
        if (
          !wrapped &&
          (!near(r.top - box.top, pad) || !near(box.bottom - r.bottom, pad))
        )
          errors.push(`${name}: control is not inset by the padding`);
      }
      const first = buttons[0]!.getBoundingClientRect();
      const last = buttons.at(-1)!.getBoundingClientRect();
      if (
        !wrapped &&
        (!near(first.left - box.left, pad) ||
          !near(box.right - last.right, pad))
      )
        errors.push(`${name}: end controls are not inset by the padding`);

      for (const separator of bar.querySelectorAll<HTMLElement>(
        '[data-slot="floating-bar-separator"]'
      )) {
        const s = separator.getBoundingClientRect();
        const before =
          separator.previousElementSibling!.getBoundingClientRect();
        const after = separator.nextElementSibling!.getBoundingClientRect();
        const center = (b: DOMRect) => b.top + b.height / 2;
        if (!wrapped && !near(center(s), center(box)))
          errors.push(`${name}: separator is not vertically centred`);
        const sameRow = (b: DOMRect) => near(center(b), center(s));
        if (
          sameRow(before) &&
          sameRow(after) &&
          (!near(s.left - before.right, pad) ||
            !near(after.left - s.right, pad))
        )
          errors.push(
            `${name}: separator spacing ${s.left - before.right}/${after.left - s.right}, expected ${pad}`
          );
      }
    }

    const list = document.querySelector<HTMLElement>(
      '[data-slot="tabs-list"]'
    )!;
    const listStyle = getComputedStyle(list);
    const listRadius = px(listStyle.borderTopLeftRadius);
    const listPad = px(listStyle.paddingTop);
    for (const trigger of list.querySelectorAll<HTMLElement>(
      '[data-slot="tabs-trigger"]'
    )) {
      const inner = px(getComputedStyle(trigger).borderTopLeftRadius);
      if (!near(inner, Math.max(2, listRadius - listPad)))
        errors.push(
          `tabs: trigger radius ${inner} ≠ ${listRadius} − ${listPad}`
        );
    }
    return { errors, radii };
  });
}

test.describe('floating bar geometry', () => {
  for (const variant of VARIANTS) {
    test(variant, async ({ page }, info) => {
      await page.setViewportSize({ width: 1024, height: 520 });
      await page.goto(`/?${variant}`);
      await expect(page.locator('[data-fixture="full"]')).toBeVisible();
      const { errors, radii } = await measure(page);
      expect(errors).toEqual([]);
      // The capsule: half the control height plus the padding.
      expect(radii.full).toBeCloseTo(22, 0);
      expect(radii.compact).toBeCloseTo(22, 0);
      // A bar with 40px controls recomputes its capsule: 20 + 6.
      expect(radii.large).toBeCloseTo(26, 0);
      // Capping the radius gives a rounded rectangle; controls follow (10).
      expect(radii.rect).toBeCloseTo(16, 0);
      expect(radii.wrapped).toBeCloseTo(22, 0);
      await info.attach(`floating-bar-${variant}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  }
});
