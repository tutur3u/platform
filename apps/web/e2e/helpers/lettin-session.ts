import type { Browser } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';

import { lettinFixturePhase } from './lettin-fixture-diagnostics';

const INVALID_SESSION_DESTINATION =
  'Invalid Lettin session request destination';

function sessionOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(INVALID_SESSION_DESTINATION);
    return url.origin;
  } catch {
    throw new Error(INVALID_SESSION_DESTINATION);
  }
}

export function createLettinSessionRequestOptions(
  origin: string,
  session: string
) {
  const expectedOrigin = sessionOrigin(origin);
  return (destination: string) => {
    if (sessionOrigin(destination) !== expectedOrigin)
      throw new Error(INVALID_SESSION_DESTINATION);
    return {
      headers: { authorization: `Bearer ${session}` },
      maxRedirects: 0,
    };
  };
}

export type LettinSessionRequestOptions = ReturnType<
  typeof createLettinSessionRequestOptions
>;

export async function createLettinBrowserContext(
  browser: Browser,
  origin: string,
  session: string
) {
  const cookieOrigin = sessionOrigin(origin);
  const context = await lettinFixturePhase('create browser context', () =>
    browser.newContext()
  );
  // Private satellite pages require the shared-session cookie as well as
  // verified app claims, matching the existing cross-app E2E fixture contract.
  await lettinFixturePhase('install session cookies', () =>
    context.addCookies(
      [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
        name,
        value: session,
        url: cookieOrigin,
        httpOnly: true,
        sameSite: 'Lax' as const,
      }))
    )
  );
  return context;
}
