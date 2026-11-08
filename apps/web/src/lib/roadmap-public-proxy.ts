import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { type Locale, supportedLocales } from '@/i18n/routing';

export const ROADMAP_UPSTREAM_ORIGIN = 'https://roadmap.tuturuuu.com';

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'if-modified-since',
  'if-none-match',
  'range',
] as const;

const BLOCKED_RESPONSE_HEADERS = new Set([
  'authorization',
  'connection',
  'content-encoding',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

export function roadmapPathnameWithoutLocale(pathname: string): {
  locale: Locale | null;
  pathnameWithoutLocale: string;
} {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  const locale = supportedLocales.includes((firstSegment ?? '') as Locale)
    ? (firstSegment as Locale)
    : null;
  const pathSegments = locale ? segments.slice(1) : segments;

  return {
    locale,
    pathnameWithoutLocale:
      pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/',
  };
}

export function isRoadmapPublicPath(pathname: string): boolean {
  const { pathnameWithoutLocale } = roadmapPathnameWithoutLocale(pathname);

  return (
    pathnameWithoutLocale === '/roadmap' ||
    pathnameWithoutLocale.startsWith('/roadmap/')
  );
}

function canonicalRoadmapRedirectPath(pathname: string): string | null {
  const { locale, pathnameWithoutLocale } =
    roadmapPathnameWithoutLocale(pathname);

  if (!isRoadmapPublicPath(pathname)) return null;

  const bareRoadmap =
    pathnameWithoutLocale === '/roadmap' && !pathname.endsWith('/');
  if (!locale && !bareRoadmap) return null;

  const unlocalized = locale
    ? pathname.slice(locale.length + 1) || '/'
    : pathname;
  if (unlocalized === '/roadmap') return '/roadmap/';

  return unlocalized.startsWith('/') ? unlocalized : `/${unlocalized}`;
}

function forwardedRequestHeaders(req: NextRequest): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

function roadmapResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();

  upstream.forEach((value, key) => {
    if (BLOCKED_RESPONSE_HEADERS.has(key) || key.startsWith('x-middleware')) {
      return;
    }
    headers.append(key, value);
  });

  return headers;
}

export async function proxyRoadmapPublicRequest(
  req: NextRequest,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<NextResponse | null> {
  if (!isRoadmapPublicPath(req.nextUrl.pathname)) return null;

  const canonicalPath = canonicalRoadmapRedirectPath(req.nextUrl.pathname);
  if (canonicalPath && canonicalPath !== req.nextUrl.pathname) {
    const target = new URL(canonicalPath, req.nextUrl);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new NextResponse(null, {
      status: 405,
      headers: {
        Allow: 'GET, HEAD',
        'Cache-Control': 'no-store',
      },
    });
  }

  const upstream = new URL(req.nextUrl.pathname, ROADMAP_UPSTREAM_ORIGIN);
  upstream.search = req.nextUrl.search;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstream, {
      cache: 'no-store',
      headers: forwardedRequestHeaders(req),
      method: req.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return new NextResponse(null, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const body =
    req.method === 'HEAD' ||
    upstreamResponse.status === 204 ||
    upstreamResponse.status === 304
      ? null
      : upstreamResponse.body;

  return new NextResponse(body, {
    headers: roadmapResponseHeaders(upstreamResponse.headers),
    status: upstreamResponse.status,
  });
}
