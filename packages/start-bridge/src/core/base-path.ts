/**
 * The basePath contract for one app served at a host root (`''`) or mounted
 * under `tuturuuu.com/<app>`. Root mode is the identity everywhere. A Worker
 * resolves the base per request (see `mounts`), so one compiled artifact
 * serves both; this object holds the rules for one resolved base.
 *
 * Under a base: requests outside it are not this app's; asset and
 * server-function requests are handled base-stripped; path-relative
 * `Location` headers gain the base; links, `router.push` and `redirect()`
 * prefix path-absolute hrefs. Absolute URLs are never rewritten. Cookies are
 * never renamed or path-scoped: the Tuturuuu session is shared across apps.
 */
export interface BasePathOptions {
  /** `''` (root) or `/<segment>`; `/meet/` is normalized to `/meet`. */
  basePath?: string;
  /** Stable app id (`meet`, `calendar`). */
  app: string;
}

export interface BasePath {
  readonly basePath: string;
  readonly app: string;
  readonly isRoot: boolean;
  /** Asset URL prefix: `/` or `/meet/`. */
  readonly assetBase: string;
  /** Default mounted server-function base: `/_serverFn` or `/meet/_serverFn`. */
  readonly serverFnBase: string;
  /** TanStack Router `basepath`: `/` or `/meet`. */
  readonly routerBasepath: string;
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
  /** Request with the base removed from its URL. */
  stripRequest(request: Request): Request | null;
  /** Rewrites a path-relative `Location` on an outgoing response. */
  finalizeResponse(response: Response): Response;
}

const BASE_PATTERN = /^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/u;

/** Removes trailing `/` in linear time (no backtracking regex on input). */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}

export function normalizeBasePath(input: string | undefined): string {
  const trimmed = trimTrailingSlashes((input ?? '').trim());
  if (!trimmed) return '';
  if (!BASE_PATTERN.test(trimmed))
    throw new Error(`Invalid basePath: ${input}`);
  return trimmed;
}

/** Prefixes a path-absolute href with `basePath` once; others pass through. */
export function prefixBase(href: string, basePath: string): string {
  if (!basePath || !href.startsWith('/') || href.startsWith('//')) return href;
  if (href.startsWith('/\\')) return href;
  const end = href.search(/[?#]/u);
  const path = end === -1 ? href : href.slice(0, end);
  if (path === basePath || path.startsWith(`${basePath}/`)) return href;
  return `${basePath}${path === '/' ? '' : path}${end === -1 ? '' : href.slice(end)}`;
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
  const owns = (pathname: string) =>
    isRoot || pathname === basePath || pathname.startsWith(`${basePath}/`);
  const strip = (pathname: string) => {
    if (isRoot) return pathname;
    if (!owns(pathname)) return null;
    return pathname.slice(basePath.length) || '/';
  };
  const withBase = (href: string) => prefixBase(href, basePath);

  return {
    basePath,
    app: options.app,
    isRoot,
    assetBase: `${basePath}/`,
    serverFnBase: `${basePath}/_serverFn`,
    routerBasepath: basePath || '/',
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
    finalizeResponse(response) {
      if (isRoot) return response;
      const location = response.headers.get('location');
      if (!location) return response;
      const rewritten = withBase(location);
      if (rewritten === location) return response;
      const result = new Response(response.body, response);
      result.headers.set('location', rewritten);
      return result;
    },
  };
}
