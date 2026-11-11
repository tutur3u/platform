import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { runtimeAppBase, withAppBase } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, TTR_URL } from '@/constants/common';
import { resolveCalendarSiteUrls } from '@/constants/site-urls';

const DEFAULT_CALENDAR_PATH = '/personal';

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return normalizeAuthRedirectPath(rawValue, BASE_URL, DEFAULT_CALENDAR_PATH);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(params.next ?? params.nextUrl);
  const shouldRefreshCrossAppSession = params.refresh === '1';
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

  // The bridge request carries the host the visitor used. Without it the
  // origin follows the app base: the web origin under the mount, Calendar's
  // own origin at the host root.
  const returnOrigin = resolveCalendarSiteUrls({
    basePath: runtimeAppBase(),
    rootOrigin: BASE_URL,
    webOrigin: TTR_URL,
  }).origin;
  const returnUrl = new URL(
    withAppBase('/verify-token'),
    maybeBridgeRequest()?.request.url ?? returnOrigin
  );
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
