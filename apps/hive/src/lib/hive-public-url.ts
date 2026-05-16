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

  return new URL(path, requestOrigin ?? HIVE_PUBLIC_APP_URL);
}
