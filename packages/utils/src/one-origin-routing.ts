/**
 * Shared-origin mounting for apps moving from `<app>.tuturuuu.com` to
 * `tuturuuu.com/<app>` (docs: platform/architecture/one-origin-super-app).
 *
 * One Worker artifact serves both hosts during migration: the Start bridge
 * resolves the base per request (root on the subdomain, `/<app>` on the
 * shared origin). This module only decides whether to serve a request
 * unchanged, redirect a subdomain navigation to the shared origin, or refuse
 * it; it never rewrites URLs.
 *
 * Portable: no framework or runtime imports. The caller passes the request and
 * resolved configuration, then applies the decision.
 */

/** `off`: subdomain canonical, shared origin refused. `shadow`: both served,
 * shared origin noindex. `on`: shared origin canonical, subdomain navigations
 * redirect. Anything else is `off`. */
export type OneOriginMode = 'off' | 'shadow' | 'on';

export type OneOriginRedirectStatus = 301 | 307;

export interface OneOriginConfig {
  /** Mount path on the shared origin, e.g. `/meet`. */
  basePath: string;
  /** Shared origin, e.g. `https://tuturuuu.com`. */
  sharedOrigin: string;
  /** Legacy app origin, e.g. `https://meet.tuturuuu.com`. */
  subdomainOrigin: string;
  mode: OneOriginMode;
  redirectStatus: OneOriginRedirectStatus;
  /**
   * Whether the deployed build can serve under `basePath` (the Start bridge
   * build). Until it can, the shared origin is refused in every mode and the
   * subdomain never redirects.
   */
  basePathReady: boolean;
  /**
   * Subdomain path prefixes that machines call: webhooks, OAuth callbacks,
   * WebSockets, server functions. They are always served and never
   * redirected. `/api`, `/assets`, `/.well-known` and `/_serverFn` are always
   * included.
   */
  machinePathPrefixes?: readonly string[];
}

export type OneOriginDecision =
  | { action: 'serve'; request: Request; noindex: boolean }
  | { action: 'redirect'; response: Response }
  | { action: 'refuse'; response: Response };

const ALWAYS_MACHINE_PREFIXES = [
  '/api',
  '/assets',
  '/.well-known',
  '/_serverFn',
] as const;

export const ONE_ORIGIN_MODES: readonly OneOriginMode[] = [
  'off',
  'shadow',
  'on',
];

/** Parse a mode variable; anything unrecognised fails closed to `off`. */
export function parseOneOriginMode(value: string | undefined): OneOriginMode {
  const normalized = value?.trim().toLowerCase();
  return ONE_ORIGIN_MODES.includes(normalized as OneOriginMode)
    ? (normalized as OneOriginMode)
    : 'off';
}

/** `301` only when explicitly requested; the observation default is `307`. */
export function parseOneOriginRedirectStatus(
  value: string | undefined
): OneOriginRedirectStatus {
  return value?.trim() === '301' ? 301 : 307;
}

function hasPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isNavigation(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.headers.get('upgrade')) return false;
  const mode = request.headers.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  // Clients without Fetch Metadata (crawlers, older browsers) ask for HTML.
  return (request.headers.get('accept') ?? '').includes('text/html');
}

function refuse() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function decideOneOriginRequest(
  request: Request,
  config: OneOriginConfig
): OneOriginDecision {
  const url = new URL(request.url);
  const { basePath } = config;

  if (url.origin === new URL(config.sharedOrigin).origin) {
    if (
      config.mode === 'off' ||
      !config.basePathReady ||
      !hasPrefix(url.pathname, basePath)
    )
      return { action: 'refuse', response: refuse() };
    return { action: 'serve', request, noindex: config.mode === 'shadow' };
  }

  if (url.origin !== new URL(config.subdomainOrigin).origin)
    // Staging, workers.dev and local hosts keep their current behaviour.
    return { action: 'serve', request, noindex: false };

  // The subdomain serves the app at its root, so its path is the app path.
  const appPath = url.pathname;
  const machine = [
    ...ALWAYS_MACHINE_PREFIXES,
    ...(config.machinePathPrefixes ?? []),
  ].some((prefix) => hasPrefix(appPath, prefix));

  if (config.mode === 'on' && config.basePathReady && !machine) {
    if (isNavigation(request)) {
      const location = `${new URL(config.sharedOrigin).origin}${basePath}${
        appPath === '/' ? '' : appPath
      }${url.search}`;
      return {
        action: 'redirect',
        response: new Response(null, {
          status: config.redirectStatus,
          headers: {
            Location: location,
            // A 307 must stay revocable while the route can still roll back.
            ...(config.redirectStatus === 307
              ? { 'Cache-Control': 'no-store' }
              : {}),
          },
        }),
      };
    }
  }

  return { action: 'serve', request, noindex: false };
}

/** Mark a shadow-mode response as not indexable without touching its body. */
export function applyOneOriginNoindex(response: Response): Response {
  // A WebSocket upgrade cannot be re-wrapped without losing its socket.
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  result.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return result;
}

/**
 * Read the per-app variables `TTR_ONE_ORIGIN_<APP>` (mode) and
 * `TTR_ONE_ORIGIN_<APP>_REDIRECT_STATUS` (`307` or `301`).
 */
export function readOneOriginEnv(
  env: Record<string, unknown>,
  app: string
): Pick<OneOriginConfig, 'mode' | 'redirectStatus'> {
  const key = `TTR_ONE_ORIGIN_${app.toUpperCase()}`;
  const read = (name: string) =>
    typeof env[name] === 'string' ? (env[name] as string) : undefined;
  return {
    mode: parseOneOriginMode(read(key)),
    redirectStatus: parseOneOriginRedirectStatus(
      read(`${key}_REDIRECT_STATUS`)
    ),
  };
}
