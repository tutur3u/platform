import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { type Locale, supportedLocales } from '@/i18n/routing';

import { PUBLIC_PATHS } from '@/constants/common';
import { isRoadmapPublicPath } from './roadmap-public-proxy';

const DESIGN_SEGMENT = 'design';
const UI_SEGMENT = 'ui';

export const DESIGN_ANONYMOUS_BROWSER_CACHE_CONTROL =
  'public, max-age=0, must-revalidate';
export const DESIGN_ANONYMOUS_CDN_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';
export const DESIGN_PRIVATE_CACHE_CONTROL = 'private, no-store';
export const DESIGN_REDIRECT_CACHE_CONTROL = 'public, max-age=86400';

export function pathnameWithoutLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale = supportedLocales.includes((firstSegment ?? '') as Locale);
  const pathSegments = hasLocale ? segments.slice(1) : segments;

  return pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';
}

/** `/design` and `/design/*` only. `/design-private` stays private. */
export function isDesignPublicPath(pathname: string): boolean {
  const path = pathnameWithoutLocale(pathname);

  return path === '/design' || path.startsWith('/design/');
}

/**
 * Map a legacy `/ui` URL onto `/design`, keeping the locale prefix and the
 * rest of the path. Neighbouring segments such as `/ui-private` are left alone.
 */
export function designRedirectPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale = supportedLocales.includes((firstSegment ?? '') as Locale);
  const offset = hasLocale ? 1 : 0;

  if (segments[offset] !== UI_SEGMENT) return null;

  const prefix = hasLocale ? `/${firstSegment}` : '';
  const rest = segments.slice(offset + 1);

  return `${prefix}/${DESIGN_SEGMENT}${rest.length > 0 ? `/${rest.join('/')}` : ''}`;
}

export function designRedirectResponse(req: NextRequest): NextResponse | null {
  const target = designRedirectPath(req.nextUrl.pathname);
  if (!target) return null;

  const redirectUrl = new URL(target, req.nextUrl);
  redirectUrl.search = req.nextUrl.search;
  const response = NextResponse.redirect(redirectUrl, 301);
  response.headers.set('Cache-Control', DESIGN_REDIRECT_CACHE_CONTROL);

  return response;
}

export function applyDesignDocumentCache(
  response: NextResponse,
  hasSession: boolean
): NextResponse {
  if (hasSession) {
    response.headers.set('Cache-Control', DESIGN_PRIVATE_CACHE_CONTROL);
    response.headers.delete('CDN-Cache-Control');
    response.headers.delete('Vercel-CDN-Cache-Control');
    return response;
  }

  response.headers.set('Cache-Control', DESIGN_ANONYMOUS_BROWSER_CACHE_CONTROL);
  response.headers.set('CDN-Cache-Control', DESIGN_ANONYMOUS_CDN_CACHE_CONTROL);
  response.headers.set(
    'Vercel-CDN-Cache-Control',
    DESIGN_ANONYMOUS_CDN_CACHE_CONTROL
  );

  return response;
}

export function designAuthOptions(
  webAppUrl: string,
  isPublicPath: (pathname: string) => boolean
) {
  return {
    webAppUrl,
    publicPaths: PUBLIC_PATHS.filter(
      (path) => !isRoadmapPublicPath(path) && !isDesignPublicPath(path)
    ),
    isPublicPath: (pathname: string) =>
      isPublicPath(pathname) || isDesignPublicPath(pathname),
    skipApiRoutes: true,
  };
}
