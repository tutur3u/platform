import {
  adoptLegacyCookie,
  type CookieScope,
  DEFAULT_SCOPED_COOKIES,
  presentScopedCookies,
  scopeSetCookie,
} from './cookie-scope';

/**
 * The basePath contract for serving one app at the origin root (`''`) or
 * under `tuturuuu.com/<app>`. Root mode is the identity everywhere, so an app
 * adopting the bridge on its own host keeps its current behaviour.
 *
 * Build time (Vite preset): asset base `${basePath}/`, server functions at
 * `${basePath}/_serverFn`, router `basepath`.
 * Runtime (Worker edge): requests outside the base are not this app's; asset
 * requests are fetched base-stripped; path-relative `Location` headers gain
 * the base; canonical session cookies are renamed and path-scoped.
 * App code (shims): links, `router.push`, and `redirect()` prefix
 * path-absolute hrefs with `withBase`. Absolute URLs are never rewritten.
 */
export interface BasePathOptions {
  /** `''` (root) or `/<segment>`; `/meet/` is normalized to `/meet`. */
  basePath?: string;
  /** Stable app id used for cookie names (`meet`, `calendar`). */
  app: string;
  /** Canonical cookie names to scope under a base. */
  scopedCookies?: readonly string[];
  /** Adopt unscoped same-origin session cookies (default `true`). */
  legacyCookieFallback?: boolean;
}

export interface BasePath {
  readonly basePath: string;
  readonly app: string;
  readonly isRoot: boolean;
  /** Vite `base`: `/` or `/meet/`. */
  readonly assetBase: string;
  /** TanStack Start `serverFns.base`. */
  readonly serverFnBase: string;
  /** TanStack Router `basepath`: `/` or `/meet`. */
  readonly routerBasepath: string;
  readonly cookieScope: CookieScope | null;
  /** Whether `pathname` belongs to this app. */
  owns(pathname: string): boolean;
  /** App-relative pathname, or `null` when outside the base. */
  strip(pathname: string): string | null;
  /** Prefix a path-absolute href (`/x?y#z`); others are returned unchanged. */
  withBase(href: string): string;
  /** Absolute URL for an app path, for auth `returnUrl`/`next` parameters. */
  absoluteUrl(appPath: string, origin: string | URL): string;
  /** Rewrites a path-relative `Location` that is not yet under the base. */
  rewriteLocation(location: string): string;
  /** Request with the base removed from its URL, e.g. for `ASSETS.fetch`. */
  stripRequest(request: Request): Request | null;
  /** Request whose `Cookie` header presents scoped cookies canonically. */
  presentRequest(request: Request): {
    request: Request;
    adopted: { name: string; value: string }[];
  };
  /** Rewrites Location and scopes Set-Cookie on an outgoing response. */
  finalizeResponse(
    response: Response,
    request: Request,
    adopted?: { name: string; value: string }[]
  ): Response;
}

export function normalizeBasePath(input: string | undefined): string {
  const trimmed = (input ?? '').trim().replace(/\/+$/u, '');
  if (!trimmed) return '';
  if (!/^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/u.test(trimmed))
    throw new Error(`Invalid basePath: ${input}`);
  return trimmed;
}

function isPathAbsolute(href: string) {
  return (
    href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')
  );
}

/** A same-method copy of `request` addressed to `url`, body streamed once. */
export function retarget(request: Request, url: string | URL): Request {
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal,
  };
  if (request.body) init.duplex = 'half';
  return new Request(url, init);
}

export function createBasePath(options: BasePathOptions): BasePath {
  const basePath = normalizeBasePath(options.basePath);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(options.app))
    throw new Error(`Invalid app id: ${options.app}`);
  const isRoot = basePath === '';
  const cookieScope: CookieScope | null = isRoot
    ? null
    : {
        app: options.app,
        path: basePath,
        names: options.scopedCookies ?? DEFAULT_SCOPED_COOKIES,
        legacyFallback: options.legacyCookieFallback ?? true,
      };

  const owns = (pathname: string) =>
    isRoot || pathname === basePath || pathname.startsWith(`${basePath}/`);
  const strip = (pathname: string) => {
    if (isRoot) return pathname;
    if (!owns(pathname)) return null;
    return pathname.slice(basePath.length) || '/';
  };
  const withBase = (href: string) => {
    if (isRoot || !isPathAbsolute(href)) return href;
    const end = href.search(/[?#]/u);
    const path = end === -1 ? href : href.slice(0, end);
    if (owns(path)) return href;
    return `${basePath}${path === '/' ? '' : path}${end === -1 ? '' : href.slice(end)}`;
  };

  return {
    basePath,
    app: options.app,
    isRoot,
    assetBase: `${basePath}/`,
    serverFnBase: `${basePath}/_serverFn`,
    routerBasepath: basePath || '/',
    cookieScope,
    owns,
    strip,
    withBase,
    absoluteUrl(appPath, origin) {
      return new URL(withBase(appPath), origin).toString();
    },
    rewriteLocation: withBase,
    stripRequest(request) {
      if (isRoot) return request;
      const url = new URL(request.url);
      const pathname = strip(url.pathname);
      if (pathname === null) return null;
      url.pathname = pathname;
      return retarget(request, url);
    },
    presentRequest(request) {
      if (!cookieScope) return { request, adopted: [] };
      const presented = presentScopedCookies(
        request.headers.get('cookie'),
        cookieScope
      );
      const headers = new Headers(request.headers);
      if (presented.header === null) headers.delete('cookie');
      else headers.set('cookie', presented.header);
      return {
        request: new Request(request, { headers }),
        adopted: presented.adopted,
      };
    },
    finalizeResponse(response, request, adopted = []) {
      if (isRoot) return response;
      const location = response.headers.get('location');
      const cookies = response.headers.getSetCookie();
      if (!location && cookies.length === 0 && adopted.length === 0)
        return response;
      const result = new Response(response.body, response);
      if (location) result.headers.set('location', withBase(location));
      result.headers.delete('set-cookie');
      const scope = cookieScope as CookieScope;
      const written = new Set<string>();
      for (const cookie of cookies) {
        const scoped = scopeSetCookie(cookie, scope);
        written.add(scoped.split('=')[0] ?? '');
        result.headers.append('set-cookie', scoped);
      }
      const secure = new URL(request.url).protocol === 'https:';
      for (const legacy of adopted) {
        const scoped = adoptLegacyCookie(legacy, scope, secure);
        // A fresh write from the app (refresh, logout) supersedes adoption.
        if (!written.has(scoped.split('=')[0] ?? ''))
          result.headers.append('set-cookie', scoped);
      }
      return result;
    },
  };
}
