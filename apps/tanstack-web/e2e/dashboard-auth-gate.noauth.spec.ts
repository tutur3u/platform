import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/public-routes';

/**
 * Unauthenticated auth-gate coverage for migrated dashboard routes.
 *
 * Every migrated auth-gated route runs `requireCurrentUser` FIRST in its
 * loader (before any workspace/backend resolution). The gate is fail-closed:
 * when the session cannot be validated — no cookies, or the internal-api
 * `/users/me/profile` call errors/times out/returns non-2xx — `resolveCurrentUser`
 * resolves to `null` and the loader throws `redirect(/{locale}/login?nextUrl=...)`
 * with a 307. See `src/lib/platform/auth-gate.ts`.
 *
 * Because the redirect happens before workspace resolution, these assertions do
 * NOT depend on a reachable Rust/legacy backend or a seeded workspace: an
 * anonymous request to any gated route must land on the locale login URL with
 * the original path preserved (open-redirect-safe) in `nextUrl`. This is the
 * regression guard that the gate stays wired across the migrated surface as the
 * fleet ports more routes.
 *
 * These specs intentionally assert only the redirect TARGET, not the login page
 * body, because `/$locale/login` itself is still a migration placeholder. When
 * the login route is migrated, extend this file with body assertions.
 */

const WS_ID = 'personal';

// Representative sample across migrated feature areas. Each entry is a route
// that gates directly via `requireCurrentUser` with `nextPath: /{wsId}/{route}`
// (verified in the route loaders). Excludes thin redirect routes like
// `finance`/`mind`/`drive` (which forward to a sub-route before gating) so the
// URL is stable without seeded data or a reachable backend.
const GATED_ROUTES = [
  'calendar',
  'chat',
  'cron',
  'memories',
  'members',
  'tasks',
] as const;

test.describe('Dashboard auth gate (unauthenticated)', () => {
  for (const route of GATED_ROUTES) {
    test(`redirects anonymous /${WS_ID}/${route} to login`, async ({
      page,
    }) => {
      const target = `/${DEFAULT_LOCALE}/${WS_ID}/${route}`;

      await page.goto(target, { waitUntil: 'domcontentloaded' });

      const url = new URL(page.url());

      // Landed on the locale-scoped login route, not the gated route.
      expect(
        url.pathname,
        `Expected anonymous access to ${target} to redirect to the login route`
      ).toBe(`/${DEFAULT_LOCALE}/login`);

      // The original path is preserved (decoded once) in nextUrl so the user
      // returns to the route after authenticating. Open-redirect-safe: it is a
      // single-slash local path, never an external origin.
      const nextUrl = url.searchParams.get('nextUrl');
      expect(
        nextUrl,
        `Expected login redirect from ${target} to carry a nextUrl return path`
      ).toBe(`/${WS_ID}/${route}`);
    });
  }
});
