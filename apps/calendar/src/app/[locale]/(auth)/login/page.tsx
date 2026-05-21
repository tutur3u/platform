import {
  getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, TTR_URL } from '@/constants/common';

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
  const appSession = getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    { targetApp: 'calendar' }
  );
  const hasWebAppSession = hasWebAppSessionTokenFromRequest({
    headers: requestHeaders,
  });

  if (appSession && hasWebAppSession && !shouldRefreshCrossAppSession) {
    redirect(nextPath);
  }

  const returnUrl = new URL('/verify-token', BASE_URL);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
