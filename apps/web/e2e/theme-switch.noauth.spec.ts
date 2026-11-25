import { expect, type Page, test } from '@playwright/test';

/**
 * Theme switching must be a pure, instant class swap on <html>: no document
 * request, no layout shift and no per-element color transitions. The swap is
 * driven through the same `storage` event another tab (or another app on the
 * shared origin) produces, so this also covers cross-tab synchronization.
 *
 * The test is read-only. The suite's global setup accepts only local origins;
 * to check a deployed origin, run this file with a config that omits
 * `globalSetup` (see apps/docs/build/devops/shell-performance.mdx).
 */

const PAGE = '/en/login';

async function trackLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as typeof window & { __themeShift?: number };
    w.__themeShift = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__themeShift =
            (w.__themeShift ?? 0) +
            (entry as unknown as { value: number }).value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Layout Instability API unavailable; the shift assertion stays 0.
    }
  });
}

async function switchThemeFromAnotherTab(page: Page, theme: 'light' | 'dark') {
  return page.evaluate(async (next) => {
    const w = window as typeof window & { __themeShift?: number };
    const root = document.documentElement;
    w.__themeShift = 0;
    const previous = localStorage.getItem('theme');
    localStorage.setItem('theme', next);
    const dispatch = () =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          oldValue: previous,
          newValue: next,
          storageArea: localStorage,
        })
      );
    // next-themes attaches its storage listener after hydration, so re-send
    // the event until it lands, then time the swap from the last dispatch.
    let startedAt = performance.now();
    dispatch();
    const giveUpAt = startedAt + 5000;
    while (!root.classList.contains(next) && performance.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (performance.now() - startedAt > 250) {
        startedAt = performance.now();
        dispatch();
      }
    }
    const appliedMs = performance.now() - startedAt;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const colorProperty = /(^|-)color$|^(fill|stroke|box-shadow|background)$/;
    const transitions = document.getAnimations().filter((animation) => {
      const property = (
        animation as Animation & { transitionProperty?: string }
      ).transitionProperty;
      return (
        animation.constructor.name === 'CSSTransition' &&
        !!property &&
        colorProperty.test(property)
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      applied: root.classList.contains(next),
      appliedMs,
      colorScheme: root.style.colorScheme,
      colorTransitions: transitions.length,
      layoutShift: w.__themeShift ?? 0,
    };
  }, theme);
}

test.describe('theme switch', () => {
  test('swaps the theme class without reloads, shifts or color transitions', async ({
    page,
  }) => {
    await trackLayoutShifts(page);
    await page.goto(PAGE, { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveClass(/\b(light|dark)\b/);

    const documentRequests: string[] = [];
    page.on('request', (request) => {
      // Subframes (the Turnstile widget re-themes itself) are not reloads.
      if (
        request.resourceType() === 'document' &&
        request.frame() === page.mainFrame()
      ) {
        documentRequests.push(request.url());
      }
    });

    for (const theme of ['dark', 'light', 'dark'] as const) {
      const result = await switchThemeFromAnotherTab(page, theme);
      expect(result.applied, `html gets the ${theme} class`).toBe(true);
      expect(result.colorScheme).toBe(theme);
      expect(result.appliedMs).toBeLessThan(250);
      expect(result.colorTransitions).toBe(0);
      expect(result.layoutShift).toBe(0);
    }

    expect(documentRequests).toEqual([]);
  });
});
