import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';

/** Web sign-in URL that returns to the given Playground page afterwards. */
export function createPlaygroundLoginUrl(returnTo: string | URL) {
  const loginUrl = new URL('/login', resolveTuturuuuWebAppUrl());
  loginUrl.searchParams.set('returnUrl', String(returnTo));
  return loginUrl;
}
