import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth product marketing routes confirmed `migrated` in
 * apps/tanstack-web/migration/route-manifest.json with a matching route file
 * under apps/tanstack-web/src/routes/$locale/products/*. Headings mirror the
 * legacy apps/web/e2e/public-marketing-routes.noauth.spec.ts assertions and the
 * rendered <h1> text in each migrated route.
 */
const productRoutes = [
  { path: `/${DEFAULT_LOCALE}/products/ai`, heading: 'AI-Powered Solutions' },
  {
    path: `/${DEFAULT_LOCALE}/products/calendar`,
    heading: 'Smart Calendar Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/crm`,
    heading: 'Customer Relationship Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/documents`,
    heading: 'Intelligent Document Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/drive`,
    heading: 'Cloud Storage Solution',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/finance`,
    heading: 'Smart Financial Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/inventory`,
    heading: 'Smart Inventory Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/lms`,
    heading: 'Learning Management System',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/mail`,
    heading: 'Smart Email Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/tasks`,
    heading: 'Smart Task Management',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/workflows`,
    heading: 'Workflow Automation',
  },
];

test.describe('Public migrated product routes', () => {
  for (const route of productRoutes) {
    test(`renders product route ${route.path}`, async ({ page }) => {
      attachRuntimeErrorListeners(page);

      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: route.heading }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Coming Soon').first()).toBeVisible();
      await expect(page.getByText('Contact Sales').first()).toBeVisible();
      await expectNoPublicRouteRuntimeError(page);
    });
  }
});
