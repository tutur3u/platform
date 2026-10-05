import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { BASE_URL, WEB_APP_URL } from '@/constants/common';

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return normalizeAuthRedirectPath(rawValue, BASE_URL, '/');
}

type LoginProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function LoginPage(props: LoginProps) {
  return (
    <Suspense fallback={null}>
      <LoginRedirect {...props} />
    </Suspense>
  );
}

async function LoginRedirect({ searchParams }: LoginProps) {
  await connection();
  const params = await searchParams;
  const nextPath = normalizeNextPath(params.next);
  const shouldRefreshCrossAppSession = params.refresh === '1';
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('lettin');
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
    redirect(nextPath);
  }

  const returnUrl = new URL('/verify-token', BASE_URL);
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
