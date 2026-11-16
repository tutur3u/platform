import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import type { NextRequest } from 'next/server';

const PORT = process.env.PORT || 7814;
const DEFAULT_HIVE_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://hive.tuturuuu.com'
    : getLocalInternalAppUrl('hive', `http://localhost:${PORT}`);

const HIVE_PUBLIC_APP_URL = resolveInternalAppUrl({
  appName: 'hive',
  candidates: [
    process.env.HIVE_APP_URL,
    process.env.NEXT_PUBLIC_HIVE_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_HIVE_APP_URL,
});

function isWildcardListenerHostname(hostname: string) {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]';
}

function getSafeRequestOrigin(request: NextRequest) {
  try {
    const url = new URL(request.url);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      isWildcardListenerHostname(url.hostname)
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function createHivePublicUrl(path: string, request?: NextRequest) {
  const requestOrigin = request ? getSafeRequestOrigin(request) : null;
  const url = new URL(path, requestOrigin ?? HIVE_PUBLIC_APP_URL);
  // On the tuturuuu.com/hive mount the request carries Next basePath '/hive';
  // a same-origin app URL stays inside it instead of landing on Web's path.
  const basePath = requestOrigin ? request?.nextUrl.basePath : '';
  if (
    basePath &&
    url.origin === requestOrigin &&
    url.pathname !== basePath &&
    !url.pathname.startsWith(`${basePath}/`)
  )
    url.pathname = `${basePath}${url.pathname === '/' ? '' : url.pathname}`;
  return url;
}
