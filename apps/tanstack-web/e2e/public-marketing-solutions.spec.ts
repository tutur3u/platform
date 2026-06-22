import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth solution routes confirmed `migrated` in
 * apps/tanstack-web/migration/route-manifest.json with a matching route file
 * under apps/tanstack-web/src/routes/$locale/solutions/*. Each route renders
 * via the shared SolutionPage component, which renders `config.title` as the
 * primary <h1>. Headings mirror the legacy
 * apps/web/e2e/public-marketing-routes.noauth.spec.ts suite.
 */
const solutionRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/solutions/construction`,
    heading: 'Transform Your Construction Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/education`,
    heading: 'Transform Your Educational Institution',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/healthcare`,
    heading: 'Transform Your Healthcare Practice',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/hospitality`,
    heading: 'Transform Your Hospitality Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/manufacturing`,
    heading: 'Transform Your Manufacturing Operations',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/pharmacies`,
    heading: 'Modern Solutions for Modern Pharmacies',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/realestate`,
    heading: 'Transform Your Real Estate Business',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/restaurants`,
    heading: 'Transform Your Restaurant Operations',
  },
  {
    path: `/${DEFAULT_LOCALE}/solutions/retail`,
    heading: 'Transform Your Retail Business',
  },
];

test.describe('Public migrated solution routes', () => {
  for (const route of solutionRoutes) {
    test(`renders solution route ${route.path}`, async ({ page }) => {
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
