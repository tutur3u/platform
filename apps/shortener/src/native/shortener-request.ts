import {
  type AssetsBinding,
  fetchAsset,
} from '@tuturuuu/start-bridge/assets';
import type { ClickGeolocation } from '../link/analytics';
import { clickRecord, trackClick } from '../link/analytics';
import { rawSearch } from '../link/destination';
import { hostRedirect, PRODUCTION_HOSTS } from '../link/hosts';
import { resolveShortLink, type ShortLinkPage } from '../link/resolve';
import type { ShortLinkStore } from '../link/store';
import { verifyShortLinkPassword } from '../link/verify';

export interface ShortenerEnvironment {
  /** The Workers assets binding, typed portably (see `fetchAsset`). */
  ASSETS: AssetsBinding;
  INTERNAL_WEB_API_ORIGIN?: string;
  SHORTENER_HOME_URL?: string;
  SHORTENER_CANONICAL_HOST_ENABLED?: string;
}

export interface ShortenerDependencies {
  store(): ShortLinkStore;
  buildInfo(request: Request): Response | null;
  guard(request: Request): Promise<Response | null>;
  forwardApi(
    request: Request,
    origin: string,
    search: string
  ): Promise<Response>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  /** Start SSR for a Worker-resolved page model; `null` renders a 404. */
  renderPage(request: Request, page: ShortLinkPage | null): Promise<Response>;
}

// Files from `public/` win over a same-named slug, as Next served them.
export const PUBLIC_FILES: ReadonlySet<string> = new Set([
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon.ico',
  '/robots.txt',
  '/site.webmanifest',
]);
export const DYNAMIC_CACHE_CONTROL =
  'private, no-cache, no-store, max-age=0, must-revalidate';
const PRIVATE_ROBOTS = 'noindex, nofollow, nosnippet';
const LEGACY_HOME_URL = 'https://tuturuuu.com';

function plain(body: string, status: number, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

function geolocation(request: Request): ClickGeolocation | undefined {
  return (request as Request & { cf?: ClickGeolocation }).cf;
}

async function apiRequest(
  request: Request,
  env: ShortenerEnvironment,
  deps: ShortenerDependencies,
  url: URL,
  search: string
) {
  const guard = await deps.guard(request);
  if (guard) return guard;
  if (url.pathname !== '/api/verify') {
    return deps.forwardApi(
      request,
      env.INTERNAL_WEB_API_ORIGIN ?? LEGACY_HOME_URL,
      search
    );
  }
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: { Allow: 'OPTIONS, POST' },
    });
  if (request.method !== 'POST')
    return new Response(null, {
      status: 405,
      headers: { Allow: 'OPTIONS, POST' },
    });
  const store = deps.store();
  return verifyShortLinkPassword(request, {
    store,
    comparePassword: deps.comparePassword,
    click: (linkId) =>
      clickRecord(linkId, request.headers, geolocation(request)),
    track: trackClick,
  });
}

async function documentRequest(
  request: Request,
  env: ShortenerEnvironment,
  deps: ShortenerDependencies,
  url: URL,
  search: string
) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (url.pathname === '/')
    return new Response(null, {
      status: 307,
      headers: { Location: env.SHORTENER_HOME_URL ?? LEGACY_HOME_URL },
    });
  if (url.pathname.length > 1 && url.pathname.endsWith('/'))
    return new Response(null, {
      status: 308,
      headers: { Location: `${url.pathname.replace(/\/+$/, '')}${search}` },
    });
  let segments: string[];
  try {
    segments = url.pathname.slice(1).split('/').map(decodeURIComponent);
  } catch {
    return plain('Invalid path', 400);
  }
  const [slug] = segments;
  // Start renders documents for GET; `finalize` strips the body for HEAD.
  const document =
    request.method === 'HEAD'
      ? new Request(request, { method: 'GET' })
      : request;
  if (segments.length !== 1 || !slug) return deps.renderPage(document, null);
  const store = deps.store();
  const resolution = await resolveShortLink(store, slug);
  if (resolution.kind !== 'redirect')
    return deps.renderPage(document, resolution);
  // The click is durable before the browser leaves, as in the legacy page.
  await trackClick(
    store,
    clickRecord(resolution.linkId, request.headers, geolocation(request))
  );
  return new Response(null, {
    status: 307,
    headers: { Location: resolution.location },
  });
}

/** Retained Next headers: anti-framing on every path, noindex everywhere. */
function finalize(request: Request, response: Response, document: boolean) {
  const result = new Response(response.body, response);
  if (document) result.headers.set('Cache-Control', DYNAMIC_CACHE_CONTROL);
  result.headers.set('X-Robots-Tag', PRIVATE_ROBOTS);
  result.headers.set('X-Frame-Options', 'DENY');
  if (!result.headers.has('Content-Security-Policy'))
    result.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  result.headers.set('X-Content-Type-Options', 'nosniff');
  return request.method === 'HEAD' ? new Response(null, result) : result;
}

export async function shortenerRequest(
  request: Request,
  env: ShortenerEnvironment,
  deps: ShortenerDependencies
): Promise<Response> {
  const url = new URL(request.url);
  const search = rawSearch(request.url);
  if (
    PRODUCTION_HOSTS.has(url.hostname) &&
    env.SHORTENER_CANONICAL_HOST_ENABLED !== '1'
  )
    return finalize(
      request,
      plain('Staging gateway only', 503, {
        'Cache-Control': 'private, no-store',
      }),
      false
    );
  const alias = hostRedirect(url, search);
  if (alias) return finalize(request, alias, true);
  const identity = deps.buildInfo(request);
  if (identity) return finalize(request, identity, false);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/'))
    return finalize(
      request,
      await apiRequest(request, env, deps, url, search),
      false
    );
  if (url.pathname.startsWith('/assets/') || PUBLIC_FILES.has(url.pathname))
    return finalize(request, await fetchAsset(env.ASSETS, request), false);
  if (url.pathname.startsWith('/_serverFn/'))
    return finalize(request, await deps.renderPage(request, null), true);
  return finalize(
    request,
    await documentRequest(request, env, deps, url, search),
    true
  );
}
