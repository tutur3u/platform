import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth legal routes confirmed `migrated` in
 * apps/tanstack-web/migration/route-manifest.json with a matching route file
 * under apps/tanstack-web/src/routes/$locale/*. Each route renders via
 * LegalPageLayout: the <h1> concatenates `title` + `highlightedWord`, the
 * summary section renders `summaryTitle`, and each route exposes its document's
 * formatted effective date. Assertions mirror the legacy
 * apps/web/e2e/public-marketing-routes.noauth.spec.ts suite.
 */
const legalRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/acceptable-use`,
    heading: 'Acceptable Use',
    summaryHeading: 'Key Policy Points',
    effectiveDate: 'February 6, 2026',
  },
  {
    path: `/${DEFAULT_LOCALE}/community-guidelines`,
    heading: 'Community Guidelines',
    summaryHeading: 'Guidelines at a Glance',
    effectiveDate: 'February 6, 2026',
  },
  {
    path: `/${DEFAULT_LOCALE}/privacy`,
    heading: 'Privacy Policy',
    summaryHeading: 'Privacy at a glance',
    effectiveDate: 'August 15, 2026',
  },
  {
    path: `/${DEFAULT_LOCALE}/terms`,
    heading: 'Terms of Service',
    summaryHeading: 'Terms at a glance',
    effectiveDate: 'August 15, 2026',
  },
];

test.describe('Public migrated legal routes', () => {
  for (const route of legalRoutes) {
    test(`renders legal route ${route.path}`, async ({ page }) => {
      attachRuntimeErrorListeners(page);

      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });

      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: route.heading }).first()
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole('heading', { name: route.summaryHeading }).first()
      ).toBeVisible();
      await expect(
        page.getByText(`Effective ${route.effectiveDate}`).first()
      ).toBeVisible();
      await expectNoPublicRouteRuntimeError(page);
    });
  }
});
