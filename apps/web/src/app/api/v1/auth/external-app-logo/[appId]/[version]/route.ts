import { connection } from 'next/server';
import {
  externalAppLogoVersion,
  getCachedExternalAppLogo,
} from '@/lib/app-coordination/external-app-logo';
import { getExternalAppById } from '@/lib/app-coordination/external-apps';

const APP_ID = /^[a-z0-9_-]{1,64}$/u;
const VERSION = /^[0-9a-f]{16}$/u;
const MISS_HEADERS = { 'Cache-Control': 'public, max-age=300' };

function miss(status = 404) {
  return new Response(null, { status, headers: MISS_HEADERS });
}

/**
 * Serves a registered external app's logo from this origin, so the sign-in
 * page keeps `img-src 'self'` and never loads a third-party image directly.
 *
 * The path is versioned by a digest of the registered URL and takes no query
 * string, so a caller cannot mint uncached variants: any other version is
 * refused before an upstream fetch, and the upstream fetch itself is cached
 * per isolate. A changed logo gets a new path, so a hit can be immutable.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; version: string }> }
) {
  await connection();
  const { appId, version } = await params;
  if (
    new URL(request.url).search ||
    !APP_ID.test(appId) ||
    !VERSION.test(version)
  ) {
    return miss();
  }

  const app = await getExternalAppById(appId).catch(() => null);
  if (
    !app?.enabled ||
    !app.logoUrl ||
    (await externalAppLogoVersion(app.logoUrl)) !== version
  ) {
    return miss();
  }

  const logo = await getCachedExternalAppLogo(app.logoUrl);
  if (!logo) return miss();

  return new Response(logo.body, {
    headers: {
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Type': logo.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** No body is sent for HEAD, so it never triggers an upstream fetch. */
export function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: 'GET' } });
}
