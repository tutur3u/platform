import { isBuildInfoPath } from './build-info.ts';

export type RoadmapBasepath = '/' | '/roadmap';
export const mountHeader = 'x-roadmap-router-base';
export const ROADMAP_SATELLITE_HOST = 'roadmap.tuturuuu.com';
export const ROADMAP_CANONICAL_ORIGIN = 'https://tuturuuu.com';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function headerHost(request: Request): string | null {
  const raw = request.headers.get('host');
  if (!raw) return null;
  return raw.split(',')[0]?.trim().toLowerCase() || null;
}

/**
 * A local server keeps the loopback URL. When its Host header is one of the
 * public roadmap hosts, treat the request as that https origin so the same
 * worker answers a pre-seal probe and a Cloudflare route.
 */
export function normalizeLocalHost(request: Request): Request {
  const url = new URL(request.url);
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return request;
  const host = headerHost(request);
  if (host !== 'tuturuuu.com' && host !== ROADMAP_SATELLITE_HOST)
    return request;
  url.protocol = 'https:';
  url.hostname = host;
  url.port = '';
  const headers = new Headers(request.headers);
  headers.set('host', host);
  return new Request(url, new Request(request, { headers }));
}

export function isRoadmapSatelliteHost(request: Request): boolean {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  return (
    url.protocol === 'https:' &&
    url.host === ROADMAP_SATELLITE_HOST &&
    (host === null || host === ROADMAP_SATELLITE_HOST)
  );
}

/** The canonical document URL. Tuturuuu URLs never end in a slash. */
export const ROADMAP_CANONICAL_URL = `${ROADMAP_CANONICAL_ORIGIN}/roadmap`;

/** `/roadmap/` → `/roadmap`, `/roadmap/x/` → `/roadmap/x`; others unchanged. */
export function withoutTrailingSlash(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * English is unprefixed: `/roadmap/en` → `/roadmap` and `/roadmap/en/<rest>`
 * → `/roadmap/<rest>` (old English links). Only an exact `en` segment
 * matches, so `/roadmap/english` or `/roadmap/enx` return null.
 */
export function withoutEnglishPrefix(path: string): string | null {
  if (path === '/roadmap/en' || path === '/roadmap/en/') return '/roadmap';
  if (!path.startsWith('/roadmap/en/')) return null;
  return withoutTrailingSlash(`/roadmap/${path.slice('/roadmap/en/'.length)}`);
}

/**
 * Map a satellite URL onto the canonical public path, keeping the query.
 * The served document is `/roadmap` (no slash) and English is unprefixed,
 * so `/en/<rest>` also lands on `/roadmap/<rest>` in a single hop.
 */
export function canonicalRoadmapLocation(url: URL): string {
  const path = url.pathname;
  const mounted =
    path === '/roadmap' || path.startsWith('/roadmap/')
      ? path
      : path === '/'
        ? '/roadmap'
        : `/roadmap${path}`;
  const mountedPath = withoutTrailingSlash(mounted);
  return `${ROADMAP_CANONICAL_ORIGIN}${withoutEnglishPrefix(mountedPath) ?? mountedPath}${url.search}`;
}

export function selectedBasepath(request: Request): RoadmapBasepath {
  return isRoadmapSatelliteHost(request) ? '/' : '/roadmap';
}

export function parseBasepath(value: unknown): RoadmapBasepath {
  if (value === '/' || value === '/roadmap') return value;
  throw new Error('Invalid server-selected roadmap basepath');
}

function transportPath(path: string): boolean {
  return ['/roadmap/assets', '/roadmap/_serverFn'].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function roadmapBoundary(
  request: Request,
  basepath = selectedBasepath(request)
): Response | undefined {
  const url = new URL(request.url);
  if (/[%\\]/.test(url.pathname) || url.pathname.includes('//')) {
    return new Response('Bad Request', { status: 400 });
  }
  // The public satellite host only redirects. The web proxy fetches workers.dev,
  // whose host is not roadmap.tuturuuu.com, so this redirect cannot loop.
  if (isRoadmapSatelliteHost(request)) {
    return new Response(null, {
      status: 301,
      headers: { Location: canonicalRoadmapLocation(url) },
    });
  }
  if (basepath === '/') {
    if (
      !transportPath(url.pathname) &&
      (url.pathname === '/roadmap' || url.pathname.startsWith('/roadmap/'))
    ) {
      return new Response(null, {
        status: 308,
        headers: {
          Location: `${url.pathname.slice('/roadmap'.length) || '/'}${url.search}`,
        },
      });
    }
    return undefined;
  }
  if (isBuildInfoPath(url.pathname)) return undefined;
  // The document is served at /roadmap itself.
  if (url.pathname === '/roadmap') return undefined;
  if (url.pathname === '/') {
    return new Response(null, {
      status: 301,
      headers: { Location: `${url.origin}/roadmap${url.search}` },
    });
  }
  if (!url.pathname.startsWith('/roadmap/')) {
    return new Response('Not Found', { status: 404 });
  }
  // Old English links (/roadmap/en, /roadmap/en/…) reach the unprefixed
  // English page in one hop, query kept.
  const english = withoutEnglishPrefix(url.pathname);
  if (english) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${url.origin}${english}${url.search}` },
    });
  }
  // Slash forms (/roadmap/, /roadmap/x/) collapse in one hop, query kept.
  if (!transportPath(url.pathname) && url.pathname.endsWith('/')) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `${url.origin}${withoutTrailingSlash(url.pathname)}${url.search}`,
      },
    });
  }
  return undefined;
}

/** Address-bar form for a slash root (`/roadmap/?q` → `/roadmap?q`), else null. */
export function canonicalAddress(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | null {
  if (location.pathname !== '/roadmap/') return null;
  return `/roadmap${location.search}${location.hash}`;
}

export function prepareRoadmapRequest(
  request: Request,
  basepath: RoadmapBasepath
): Request {
  const url = new URL(request.url);
  if (basepath === '/' && !transportPath(url.pathname)) {
    url.pathname = `/roadmap${url.pathname}`;
  }
  // The public document is /roadmap (no slash). The pinned router builds its
  // basepath root as /roadmap/ and would 307 the bare form, so the SSR
  // handler sees the slash form internally; the visitor's URL is unchanged.
  if (url.pathname === '/roadmap') url.pathname = '/roadmap/';
  const headers = new Headers(request.headers);
  headers.set(mountHeader, basepath);
  return new Request(url, new Request(request, { headers }));
}

export function hydrationBasepath(data: unknown): RoadmapBasepath {
  if (!data || typeof data !== 'object' || !('roadmapBasepath' in data)) {
    throw new Error('Missing server-selected roadmap basepath');
  }
  return parseBasepath(data.roadmapBasepath);
}
