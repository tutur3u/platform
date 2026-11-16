import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BASE_URL, WEB_APP_URL } from '@/constants/common';
import { createMindPublicUrl } from '@/lib/mind-public-url';

/** The public Mind path for `path`, or the app root (`/mind` on the mount)
 * when the path cannot stay inside it; an unusable target is never a 500. */
function mindPublicPath(path: string) {
  try {
    const target = createMindPublicUrl(path);
    return `${target.pathname}${target.search}`;
  } catch {
    return new URL(BASE_URL).pathname.replace(/\/+$/u, '') || '/';
  }
}

function normalizeNextPath(value: string | string[] | undefined) {
  let candidate = Array.isArray(value) ? value[0] : value;
  const base = new URL(BASE_URL);
  const basePath = base.pathname.replace(/\/+$/u, '');
  for (let depth = 0; depth < 5; depth += 1) {
    const normalized = normalizeAuthRedirectPath(candidate, base.origin, '/');
    const url = new URL(normalized, base.origin);
    const appPath =
      basePath && url.pathname.startsWith(`${basePath}/`)
        ? url.pathname.slice(basePath.length)
        : url.pathname;
    if (['/login', '/verify-token', '/api/auth/callback'].includes(appPath)) {
      candidate =
        url.searchParams.get('nextUrl') ??
        url.searchParams.get('next') ??
        url.searchParams.get('returnUrl') ??
        undefined;
      continue;
    }
    return mindPublicPath(normalized);
  }
  return mindPublicPath('/');
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
  const appSession = await getSatelliteAppSession('mind');
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

  const returnUrl = createMindPublicUrl('/verify-token');
  returnUrl.searchParams.set('nextUrl', nextPath);

  const loginUrl = new URL('/login', WEB_APP_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());

  redirect(loginUrl.toString());
}
