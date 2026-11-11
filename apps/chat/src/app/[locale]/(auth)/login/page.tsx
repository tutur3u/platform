import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, WEB_APP_URL } from '@/constants/common';
import { createChatPublicUrl } from '@/lib/chat-public-url';

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return normalizeAuthRedirectPath(rawValue, BASE_URL, '/');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(params.next);
  const shouldRefreshCrossAppSession = params.refresh === '1';
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('chat');
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

  const returnUrl = createChatPublicUrl('/verify-token');
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
