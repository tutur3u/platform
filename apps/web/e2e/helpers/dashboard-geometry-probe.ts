import { expect, type Page } from '@playwright/test';
import {
  type Box,
  type DashboardGeometry,
  findDashboardGeometryViolations,
  overlapArea,
  railPlacement,
} from '../../../../packages/ui/src/components/ui/workspace-dashboard/dashboard-geometry';

// Breakpoints from workspace-dashboard-layout.tsx: the rail sits beside the
// main column from 56rem of dashboard width; Mira docks below 40rem.
export const SIDE_RAIL_MIN_WIDTH = 896;
export const DOCK_MAX_WIDTH = 640;
export const DASHBOARD_VIEWPORTS = [390, 728, 1024, 1440] as const;

/** Measures real boxes of the dashboard layout, cards and card contents. */
export async function measureDashboard(page: Page, includeDock: boolean) {
  return page.evaluate((withDock): DashboardGeometry => {
    const box = (el: Element, name: string): Box => {
      const r = el.getBoundingClientRect();
      return { name, left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const layout = document.querySelector('[data-dashboard-layout]');
    if (!layout) throw new Error('dashboard layout not rendered');
    const cardEls = [...layout.querySelectorAll('[data-dashboard-card]')];
    const blockSelector = [
      '[data-dashboard-region="main"] > *',
      '[data-dashboard-region="rail"] > *',
      ...(withDock ? ['[data-dashboard-region="dock"]'] : []),
    ].join(', ');
    const cardContents: Record<string, Box[]> = {};
    for (const card of cardEls) {
      const name = card.getAttribute('data-dashboard-card') ?? 'card';
      cardContents[name] = [...card.querySelectorAll('h2, h3, a, button, [title]')]
        .filter((el) => !el.closest('.sr-only'))
        .filter((el, _, all) => !all.some((o) => o !== el && el.contains(o)))
        .map((el, i) =>
          box(el, `${el.matches('a, button') ? 'action' : 'label'}:${el.tagName.toLowerCase()}#${i}`)
        );
    }
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      container: box(layout, 'dashboard'),
      blocks: [...layout.querySelectorAll(blockSelector)].map((el, i) =>
        box(
          el,
          el.getAttribute('data-dashboard-card') ??
            el.getAttribute('data-dashboard-region') ??
            `block-${i}`
        )
      ),
      cards: cardEls.map((el) => box(el, el.getAttribute('data-dashboard-card') ?? 'card')),
      cardContents,
    };
  }, includeDock);
}

/** Scrolls whichever ancestor scrolls the dashboard to its very end. */
export async function scrollDashboardToEnd(page: Page) {
  await page.evaluate(() => {
    let el: HTMLElement | null = document.querySelector('[data-dashboard-layout]');
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
      el = el.parentElement;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
}

export const rectBox = (
  name: string,
  b: { x: number; y: number; width: number; height: number }
): Box => ({ name, left: b.x, top: b.y, width: b.width, height: b.height });

/** Every geometry violation on the current page, without asserting. */
export async function dashboardViolations(page: Page) {
  const dock = page.locator('[data-dashboard-region="dock"]');
  const docked = await dock.evaluate((el) => getComputedStyle(el).position === 'sticky');
  const geometry = await measureDashboard(page, !docked);
  const violations = findDashboardGeometryViolations(geometry);
  if (docked !== geometry.container.width < DOCK_MAX_WIDTH) {
    violations.push(`dock ${docked ? 'docked' : 'not docked'} at ${Math.round(geometry.container.width)}px`);
  }
  const [mainBox, railBox] = await Promise.all([
    page.locator('[data-dashboard-region="main"]').boundingBox(),
    page.locator('[data-dashboard-region="rail"]').boundingBox(),
  ]);
  if (mainBox && railBox && railBox.height > 0) {
    const expected = geometry.container.width >= SIDE_RAIL_MIN_WIDTH ? 'beside' : 'below';
    const actual = railPlacement(rectBox('main', mainBox), rectBox('rail', railBox));
    if (actual !== expected) violations.push(`rail ${actual}, expected ${expected}`);
  }
  return { docked, geometry, violations };
}

/**
 * Full layout contract: no violations, and when Mira is docked it stays on
 * screen, clears the Sorbet mobile dock, never hides a focused control, and
 * covers no card at the end of the page.
 */
export async function expectDashboardGeometry(page: Page, viewportHeight: number) {
  const { docked, violations } = await dashboardViolations(page);
  expect(violations).toEqual([]);
  if (!docked) return;

  const dock = page.locator('[data-dashboard-region="dock"]');
  const dockBox = await dock.boundingBox();
  expect(dockBox).not.toBeNull();
  expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(viewportHeight + 1);

  const appDock = page.locator('[data-slot="mobile-dock"]');
  if ((await appDock.count()) > 0 && (await appDock.isVisible())) {
    const appDockBox = await appDock.boundingBox();
    expect(
      overlapArea(rectBox('mira', dockBox!), rectBox('mobile-dock', appDockBox!)),
      'docked Mira overlaps the mobile dock'
    ).toBe(0);
  }

  const layout = page.locator('[data-dashboard-layout]');
  const lastAction = layout
    .locator('[data-dashboard-card] a, [data-dashboard-card] button')
    .last();
  if ((await lastAction.count()) > 0) {
    await lastAction.focus();
    const [focusedBox, dockWhileFocused] = await Promise.all([
      lastAction.boundingBox(),
      dock.boundingBox(),
    ]);
    expect(focusedBox!.y + focusedBox!.height).toBeLessThanOrEqual(dockWhileFocused!.y + 1);
  }

  await scrollDashboardToEnd(page);
  const end = await measureDashboard(page, false);
  const endDock = await dock.boundingBox();
  for (const card of end.cards) {
    expect(overlapArea(card, rectBox('dock', endDock!)), card.name).toBe(0);
  }
}
