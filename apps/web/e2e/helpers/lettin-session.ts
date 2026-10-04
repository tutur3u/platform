import type { Browser } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';

export async function createLettinBrowserContext(
  browser: Browser,
  origin: string,
  session: string
) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { authorization: `Bearer ${session}` },
  });
  // Private satellite pages require the shared-session cookie as well as
  // verified app claims, matching the existing cross-app E2E fixture contract.
  await context.addCookies(
    [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
      name,
      value: session,
      url: origin,
      httpOnly: true,
      sameSite: 'Lax' as const,
    }))
  );
  return context;
}
