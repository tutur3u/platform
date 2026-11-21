import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import {
  getSatelliteAppSession,
  getSatelliteSupabaseSessionUser,
} from '@tuturuuu/satellite/auth';
import { runtimeAppBase, withAppBase } from '@tuturuuu/start-bridge/app-url';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, TTR_URL } from '@/constants/common';

const DEFAULT_CALENDAR_PATH = '/personal';

function normalizeNextPath(
  value: string | string[] | undefined,
  origin: string
) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  // The same-origin check compares URL origins, and the apex mount's BASE_URL
  // carries the `/calendar` path, so compare against its origin only.
  return normalizeAuthRedirectPath(rawValue, origin, DEFAULT_CALENDAR_PATH);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const appBase = runtimeAppBase();
  const origin = new URL(maybeBridgeRequest()?.request.url ?? BASE_URL).origin;
  const nextPath = normalizeNextPath(
    params.next ?? params.nextUrl,
    appBase ? origin : new URL(BASE_URL).origin
  );
  const shouldRefreshCrossAppSession = params.refresh === '1';
  if (appBase) {
    const path = new URL(nextPath, origin).pathname;
    const relative =
      createBasePath({ app: 'calendar', basePath: appBase }).strip(path) ??
      path;
    const authStep = /^\/(?:(?:en|vi)\/)?(?:login|verify-token)\/?$/u.test(
      relative
    );
    const destination = withAppBase(
      authStep ? DEFAULT_CALENDAR_PATH : nextPath,
      appBase
    );
    const user = await getSatelliteSupabaseSessionUser();
    if (user?.id && !shouldRefreshCrossAppSession) redirect(destination);
    const central = new URL('/login', TTR_URL);
    central.searchParams.set('returnUrl', new URL(destination, origin).href);
    redirect(central.href);
  }
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('calendar');
  const hasWebAppSession = hasWebAppSessionTokenFromRequest({
    headers: requestHeaders,
  });
  const hasSupabaseSession = hasSupportedSupabaseAuthCookie({
    headers: requestHeaders,
  });

  if (
    appSession &&
    (hasWebAppSession || hasSupabaseSession) &&
    !shouldRefreshCrossAppSession
  ) {
    redirect(withAppBase(nextPath));
  }

  const returnUrl = new URL(
    '/verify-token',
    maybeBridgeRequest()?.request.url ?? BASE_URL
  );
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
