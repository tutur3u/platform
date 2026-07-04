import { expect, test } from '@playwright/test';
import {
  attachRuntimeErrorListeners,
  DEFAULT_LOCALE,
  expectNoPublicRouteRuntimeError,
} from './helpers/public-routes';

/**
 * Public, no-auth UI documentation / component-showcase routes confirmed
 * `migrated` in apps/tanstack-web/migration/route-manifest.json with a matching
 * route file under apps/tanstack-web/src/routes/$locale/ui/*.
 *
 * Headings come from the rendered <h1>:
 * - `/ui` and the docs pages render `DocsPageHeader` (an <h1>) whose title is a
 *   `ui-showcase.docs.*.title` string from web/messages/en.json.
 * - `/ui/components/:componentId` renders `doc.name` as the <h1>; `button`
 *   resolves to the live `Button` registry entry (slug === id), so the detail
 *   page heading is "Button".
 *
 * Resilient role/heading + substring matching keeps these stable against the
 * gradient `<span>` splits and locale-translated copy in the rendered markup.
 */
const uiDocsRoutes = [
  {
    path: `/${DEFAULT_LOCALE}/ui`,
    heading: 'Tuturuuu UI documentation',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/setup`,
    heading: 'Set up Tuturuuu UI',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/components`,
    heading: 'Components',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/components/button`,
    heading: 'Button',
  },
  {
    path: `/${DEFAULT_LOCALE}/ui/contributing`,
    heading: 'Contributing to the UI docs',
  },
];

test.describe('Public migrated UI documentation routes', () => {
  for (const route of uiDocsRoutes) {
    test(`renders ui-docs route ${route.path}`, async ({ page }) => {
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
