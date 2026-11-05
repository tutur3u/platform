import {
  getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteSupabaseSessionUser } from '@tuturuuu/satellite/auth';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, TTR_URL } from '@/constants/common';

const DEFAULT_MAIL_PATH = '/personal';

function normalizeNextPath(
  value: string | string[] | undefined,
  origin: string
) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return normalizeAuthRedirectPath(rawValue, origin, DEFAULT_MAIL_PATH);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const servingRequest = maybeBridgeRequest()?.request;
  const appOrigin = servingRequest
    ? new URL(servingRequest.url).origin
    : BASE_URL;
  const nextPath = normalizeNextPath(params.next ?? params.nextUrl, appOrigin);
  const shouldRefreshCrossAppSession = params.refresh === '1';
  const requestHeaders = await headers();
  const appSession = getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    { targetApp: 'mail' }
  );
  const hasWebAppSession = hasWebAppSessionTokenFromRequest({
    headers: requestHeaders,
  });
  const supabaseUser = await getSatelliteSupabaseSessionUser();

  if (
    (supabaseUser?.id || (appSession && hasWebAppSession)) &&
    !shouldRefreshCrossAppSession
  ) {
    redirect(nextPath);
  }

  const returnUrl = new URL(withAppBase('/verify-token'), appOrigin);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
