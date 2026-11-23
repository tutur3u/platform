import { connection } from 'next/server';
import { fetchExternalAppLogo } from '@/lib/app-coordination/external-app-logo';
import { getExternalAppById } from '@/lib/app-coordination/external-apps';

const APP_ID = /^[a-z0-9_-]{1,64}$/u;
const MISS_HEADERS = { 'Cache-Control': 'public, max-age=300' };

/**
 * Serves a registered external app's logo from this origin, so the sign-in
 * page keeps `img-src 'self'` and never loads a third-party image directly.
 * The CDN caches a hit for a day; a miss is cached briefly and the page
 * falls back to its neutral app glyph.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  await connection();
  const { appId } = await params;
  if (!APP_ID.test(appId)) {
    return new Response(null, { status: 404, headers: MISS_HEADERS });
  }

  const app = await getExternalAppById(appId).catch(() => null);
  const logo = app?.enabled ? await fetchExternalAppLogo(app.logoUrl) : null;
  if (!logo) {
    return new Response(null, { status: 404, headers: MISS_HEADERS });
  }

  return new Response(logo.body, {
    headers: {
      'Cache-Control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Type': logo.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
