import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth static marketing routes confirmed `migrated` in
 * apps/tanstack-web/migration/route-manifest.json with a matching route file
 * under apps/tanstack-web/src/routes/$locale/*.
 *
 * Headings are taken from the rendered <h1> of each migrated route (which
 * concatenates `part1` + highlighted span text), so they intentionally differ
 * from a few legacy apps/web copies whose headings changed during migration.
 * Resilient role/heading + substring matching keeps these stable against the
 * gradient `<span>` splits in the rendered markup.
 *
 * Routes that hydrate from the Rust backend via server functions (blog,
 * changelog, contact, models) still render their static hero <h1> on first
 * paint, so they only assert on that heading and on the absence of runtime
 * errors. A full green run requires the dual-stack compose (tanstack-web +
 * backend) to be up.
 */
const staticRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/about`,
    heading: 'Unlocking Human Potential',
  },
  {
    path: '/vi/about',
    heading: 'Giải Phóng Tiềm Năng Con Người',
  },
  {
    path: `/${DEFAULT_LOCALE}/blog`,
    heading: 'Insights & Innovation',
  },
  {
    path: `/${DEFAULT_LOCALE}/branding`,
    heading: 'Brand guidelines and assets',
  },
  {
    path: `/${DEFAULT_LOCALE}/careers`,
    heading: 'Build the Future of Focused Work',
  },
  {
    path: `/${DEFAULT_LOCALE}/changelog`,
    heading: "What's New in Tuturuuu",
  },
  {
    path: `/${DEFAULT_LOCALE}/contact`,
    heading: "Let's Build Together",
  },
  {
    path: `/${DEFAULT_LOCALE}/contributors`,
    heading: 'Meet Our Contributors',
  },
  {
    path: `/${DEFAULT_LOCALE}/models`,
    heading: 'AI Models Directory',
  },
  {
    path: `/${DEFAULT_LOCALE}/partners`,
    heading: 'Our Partners',
  },
  {
    path: `/${DEFAULT_LOCALE}/women-in-tech`,
    heading: 'Women Leading',
  },
];

test.describe('Public migrated static marketing routes', () => {
  for (const route of staticRoutes) {
    test(`renders static marketing route ${route.path}`, async ({ page }) => {
      attachRuntimeErrorListeners(page);

      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: route.heading }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expectNoPublicRouteRuntimeError(page);
    });
  }
});
