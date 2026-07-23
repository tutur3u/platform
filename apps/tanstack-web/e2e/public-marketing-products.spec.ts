import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth product marketing routes confirmed `migrated` in
 * apps/tanstack-web/migration/route-manifest.json with a matching route file
 * under apps/tanstack-web/src/routes/$locale/products/*. Headings and calls to
 * action mirror apps/web/e2e/public-marketing-routes.noauth.spec.ts so the
 * migration smoke suite catches stale product positioning or dead launch CTAs.
 */
const productRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/products/ai`,
    heading: 'Five systems, one assistant you talk to',
    primaryCta: 'Start with Mira',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/calendar`,
    heading: 'A calendar that defends your day',
    primaryCta: 'Open Calendar',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/crm`,
    heading: 'Every customer, and everything you promised them',
    primaryCta: 'Open Contacts',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/documents`,
    heading: 'Write it down where the work already lives',
    primaryCta: 'Start writing',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/drive`,
    heading: 'Your files, where the rest of the work is',
    primaryCta: 'Open Drive',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/finance`,
    heading: 'Know where the money went, without the spreadsheet',
    primaryCta: 'Open Finance',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/inventory`,
    heading: 'Stock counts that match the shelf',
    primaryCta: 'Open Inventory',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/lms`,
    heading: 'Courses, assignments and where each learner stands',
    primaryCta: 'Open Learn',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/mail`,
    heading: 'An inbox that hands work to the rest of your day',
    primaryCta: 'Open Mail',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/tasks`,
    heading: 'Work that stays where you left it',
    primaryCta: 'Open Tasks',
  },
  {
    path: `/${DEFAULT_LOCALE}/products/workflows`,
    heading: 'The routine parts, handled without you',
    primaryCta: 'Set up your workspace',
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
      await expect(
        page.getByRole('link', { name: route.primaryCta }).first()
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Talk to us' }).first()
      ).toBeVisible();
      await expectNoPublicRouteRuntimeError(page);
    });
  }
});
