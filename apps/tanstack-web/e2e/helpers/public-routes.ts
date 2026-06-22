import { expect, type Page } from '@playwright/test';

/**
 * Default locale segment for public marketing routes under `/$locale/...`.
 * Mirrors `apps/web/e2e/helpers/constants.ts` (DEFAULT_LOCALE = 'en') so the
 * tanstack-web specs assert on the same English copy the legacy suite used.
 */
export const DEFAULT_LOCALE = 'en';

/**
 * Visible text fragments that indicate a route failed to render. Mirrors the
 * legacy `apps/web/e2e/helpers/public-routes.ts` helper. Replicated locally so
 * the tanstack-web suite does not import across apps.
 */
const runtimeErrorPatterns = [
  'Application error',
  'Internal Server Error',
  'Unhandled Runtime Error',
  'This page could not be found',
];

/**
 * Assert that a public route did not render visible runtime error text and did
 * not emit uncaught page errors. Attach `attachRuntimeErrorListeners` before
 * navigating to capture console/page errors for the same page instance.
 */
export async function expectNoPublicRouteRuntimeError(page: Page) {
  for (const pattern of runtimeErrorPatterns) {
    await expect(
      page.getByText(pattern).first(),
      `Expected public route not to render visible runtime error text: ${pattern}`
    ).toBeHidden();
  }

  const errors = pageRuntimeErrors.get(page) ?? [];
  expect(
    errors,
    `Expected no uncaught runtime/console errors, received: ${errors.join('\n')}`
  ).toEqual([]);
}

const pageRuntimeErrors = new WeakMap<Page, string[]>();

/**
 * Begin collecting uncaught page errors and console errors for the given page.
 * Call this once, before the first navigation, so the collected list is
 * available to `expectNoPublicRouteRuntimeError` after the route renders.
 */
export function attachRuntimeErrorListeners(page: Page) {
  const errors: string[] = [];
  pageRuntimeErrors.set(page, errors);

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`);
    }
  });
}
