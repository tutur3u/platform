import { type AssetsBinding, fetchAsset } from '@tuturuuu/start-bridge/assets';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  APP_BASE_HEADER,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import type { ClickGeolocation } from '../link/analytics';
import { clickRecord, trackClick } from '../link/analytics';
import { rawSearch } from '../link/destination';
import { hostRedirect, PRODUCTION_HOSTS } from '../link/hosts';
import { shortenerMounts } from '../link/mounts';
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
  // One compiled Worker serves both surfaces: the production hosts at their
  // root and the platform apex under `/shortener` (see `shortenerMounts`).
  const mount = resolveAppBase(url, shortenerMounts);
  if (!mount) return finalize(request, plain('Unknown host', 404), false);
  const base = createBasePath({ app: 'shortener', basePath: mount.basePath });
  const productionSurface = !base.isRoot || PRODUCTION_HOSTS.has(url.hostname);
  if (productionSurface && env.SHORTENER_CANONICAL_HOST_ENABLED !== '1')
    return finalize(
      request,
      plain('Staging gateway only', 503, {
        'Cache-Control': 'private, no-store',
      }),
      false
    );
  if (env.SHORTENER_CANONICAL_HOST_ENABLED === '1' && !productionSurface)
    return finalize(request, plain('Unknown host', 404), false);
  const alias = hostRedirect(url, search);
  if (alias) return finalize(request, alias, true);
  // The apex mount is canonical without a trailing slash, like every path.
  if (
    !base.isRoot &&
    url.pathname.length > base.basePath.length &&
    url.pathname.endsWith('/')
  )
    return finalize(
      request,
      new Response(null, {
        status: 308,
        headers: {
          Location: `${url.pathname.replace(/\/+$/, '')}${search}`,
        },
      }),
      true
    );
  // Mounted requests route on their base-stripped URL and carry the
  // bridge-owned base header for Start; a client-sent copy is never trusted.
  const headers = new Headers(request.headers);
  headers.delete(APP_BASE_HEADER);
  if (!base.isRoot) headers.set(APP_BASE_HEADER, base.basePath);
  const appRequest = new Request(base.stripRequest(request) ?? request, {
    headers,
  });
  const appUrl = new URL(appRequest.url);
  // Start may answer a rendered page with a path-relative Location; under the
  // mount it is finalized with the base before it reaches the client.
  const appDeps: ShortenerDependencies = base.isRoot
    ? deps
    : {
        ...deps,
        renderPage: async (input, page) =>
          base.finalizeResponse(await deps.renderPage(input, page)),
      };
  const identity = appDeps.buildInfo(appRequest);
  if (identity) return finalize(request, identity, false);
  if (appUrl.pathname === '/api' || appUrl.pathname.startsWith('/api/'))
    return finalize(
      request,
      await apiRequest(appRequest, env, appDeps, appUrl, search),
      false
    );
  if (
    appUrl.pathname.startsWith('/assets/') ||
    PUBLIC_FILES.has(appUrl.pathname)
  )
    return finalize(request, await fetchAsset(env.ASSETS, appRequest), false);
  if (appUrl.pathname.startsWith('/_serverFn/'))
    return finalize(request, await appDeps.renderPage(appRequest, null), true);
  return finalize(
    request,
    await documentRequest(appRequest, env, appDeps, appUrl, search),
    true
  );
}
