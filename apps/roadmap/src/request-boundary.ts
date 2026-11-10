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

/** Map a satellite URL onto the canonical public path, keeping the query. */
export function canonicalRoadmapLocation(url: URL): string {
  const path = url.pathname;
  const mounted =
    path === '/roadmap' || path.startsWith('/roadmap/')
      ? path
      : path === '/'
        ? '/roadmap/'
        : `/roadmap${path}`;
  return `${ROADMAP_CANONICAL_ORIGIN}${mounted}${url.search}`;
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
  if (url.pathname === '/' || url.pathname === '/roadmap') {
    return new Response(null, {
      status: 308,
      headers: { Location: `/roadmap/${url.search}` },
    });
  }
  if (!url.pathname.startsWith('/roadmap/')) {
    return new Response('Not Found', { status: 404 });
  }
  return undefined;
}

export function prepareRoadmapRequest(
  request: Request,
  basepath: RoadmapBasepath
): Request {
  const url = new URL(request.url);
  if (basepath === '/' && !transportPath(url.pathname)) {
    url.pathname = `/roadmap${url.pathname}`;
  }
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
