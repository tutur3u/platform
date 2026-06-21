import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth utility/tool and security routes confirmed `migrated` in
 * apps/tanstack-web/migration/route-manifest.json with a matching route file
 * under apps/tanstack-web/src/routes/$locale/*.
 *
 * Headings are taken from the rendered <h1> of each migrated route:
 * - `/tools/random` renders the `RandomGeneratorPage` <h1> ("Secure random
 *   generator", the top-level `title` key from random-generator-messages).
 * - `/security`, `/security/policy`, `/security/bug-bounty` render hero <h1>s
 *   whose highlighted text is split across gradient `<span>`s, so heading-role
 *   accessible-name matching is used to concatenate them.
 *
 * Note: `/qr-generator` is intentionally NOT covered here. Its route is a
 * loader-only 307 redirect (apps/tanstack-web/src/routes/$locale/qr-generator.tsx)
 * with no renderable content of its own.
 */
const utilityRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/tools/random`,
    heading: 'Secure random generator',
  },
  {
    path: `/${DEFAULT_LOCALE}/security`,
    heading: 'Your Security is Our Top Priority',
  },
  {
    path: `/${DEFAULT_LOCALE}/security/policy`,
    heading: 'Tuturuuu security policy for responsible disclosure',
  },
  {
    path: `/${DEFAULT_LOCALE}/security/bug-bounty`,
    heading: 'Thank you to the people who make Tuturuuu safer',
  },
];

test.describe('Public migrated utility and security routes', () => {
  for (const route of utilityRoutes) {
    test(`renders utility route ${route.path}`, async ({ page }) => {
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
