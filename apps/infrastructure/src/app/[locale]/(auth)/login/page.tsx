import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
} from '@tuturuuu/utils/constants';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, TTR_URL } from '@/constants/common';

const DEFAULT_INFRA_PATH = `/${INTERNAL_WORKSPACE_SLUG}`;

function normalizeInfraRedirectPath(path: string) {
  const url = new URL(path, BASE_URL);
  const personalPrefix = `/${PERSONAL_WORKSPACE_SLUG}`;

  if (
    url.pathname === personalPrefix ||
    url.pathname.startsWith(`${personalPrefix}/`)
  ) {
    url.pathname = `/${INTERNAL_WORKSPACE_SLUG}${url.pathname.slice(
      personalPrefix.length
    )}`;
  }

  return `${url.pathname}${url.search}`;
}

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return normalizeInfraRedirectPath(
    normalizeAuthRedirectPath(rawValue, BASE_URL, DEFAULT_INFRA_PATH)
  );
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
  const appSession = await getSatelliteAppSession('infra');
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

  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
