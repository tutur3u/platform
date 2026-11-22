import { decideOneOriginRequest } from '../../../packages/utils/src/one-origin-routing';

/** A Worker service binding. */
interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

/**
 * Environment of the `tuturuuu-apex-redirect` Worker, which takes over an
 * app's legacy subdomain (`tasks.tuturuuu.com`) once the app is served at
 * `tuturuuu.com/<app>`.
 */
export interface SubdomainRedirectEnv {
  /** The shared origin's host. Default `tuturuuu.com`. */
  SHARED_HOST?: string;
  /**
   * Comma-separated apps whose subdomain navigations answer `301` to
   * `https://<SHARED_HOST>/<app><path><query>`. A listed app needs its
   * `APP_<APP>` binding. Removing an app keeps its subdomain served by its
   * own Worker through the binding.
   */
  SUBDOMAIN_REDIRECT_APPS?: string;
  [name: string]: string | ServiceBinding | undefined;
}

const APP_LABEL = /^[a-z][a-z0-9-]*$/u;

/**
 * Subdomain paths reached by links an app sent earlier and by machines. Auth
 * return URLs land on `verify-token` and finish there; its follow-up
 * navigation then redirects. Include locale-prefixed forms since a callback
 * or asset can be reached through a localized legacy URL.
 */
const MACHINE_PATH_PREFIXES = [
  '/api',
  '/assets',
  '/.well-known',
  '/_fn',
  '/_serverFn',
  '/_next',
  '/_rum',
  '/auth',
  '/verify-token',
  '/apple-app-site-association',
  '/media',
  '/robots.txt',
  '/serwist',
  '/offline.html',
  '/site.webmanifest',
];

function localizedPrefixes(prefixes: readonly string[]) {
  return prefixes.flatMap((prefix) => [prefix, `/en${prefix}`, `/vi${prefix}`]);
}

const MACHINE_PATHS = localizedPrefixes(MACHINE_PATH_PREFIXES);
const APP_MACHINE_PATHS = new Map([
  ['calendar', localizedPrefixes(['/_calendar/functions'])],
  ['mail', localizedPrefixes(['/_mail'])],
  [
    'meet',
    localizedPrefixes([
      '/live-connect',
      '/realtime',
      '/_meet',
      '/native-collaboration',
    ]),
  ],
]);

function plain(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' },
  });
}

/** The app binding for a `<app>.<SHARED_HOST>` request, by host label. */
export function subdomainApp(url: URL, env: SubdomainRedirectEnv) {
  const shared = (env.SHARED_HOST ?? 'tuturuuu.com').toLowerCase();
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(`.${shared}`)) return null;
  const app = host.slice(0, -(shared.length + 1));
  if (!APP_LABEL.test(app)) return null;
  const binding = env[`APP_${app.replace(/-/gu, '_').toUpperCase()}`];
  return binding &&
    typeof binding === 'object' &&
    typeof binding.fetch === 'function'
    ? { app, shared, binding }
    : null;
}

/**
 * Redirects a listed app's subdomain navigations to its shared-origin mount
 * and hands every other request (machine paths, fetches, unlisted apps) to the
 * app Worker unchanged, so in-flight API calls, uploads and auth callbacks on
 * the subdomain keep working.
 */
export async function handleSubdomainRedirect(
  request: Request,
  env: SubdomainRedirectEnv
): Promise<Response> {
  const url = new URL(request.url);
  const target = subdomainApp(url, env);
  if (!target) return plain(404, 'Not Found');
  const listed = (env.SUBDOMAIN_REDIRECT_APPS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(target.app);
  if (listed && target.app !== 'mastermind') {
    const basePath = `/${target.app}`;
    const sharedOrigin = `https://${target.shared}`;
    const decision = decideOneOriginRequest(request, {
      basePath,
      sharedOrigin,
      subdomainOrigin: `https://${url.host.toLowerCase()}`,
      mode: 'on',
      redirectStatus: 301,
      basePathReady: true,
      machinePathPrefixes: [
        ...MACHINE_PATHS,
        ...(APP_MACHINE_PATHS.get(target.app) ?? []),
      ],
    });
    if (decision.action === 'redirect') {
      // A stored 301 would outlive a rollback and also answer later
      // non-navigation requests (fetches, webhook retries) to the same URL.
      const response = new Response(null, decision.response);
      const location = response.headers.get('Location');
      if (location && /^\/en(?:\/|$)/u.test(url.pathname)) {
        const mount = `${sharedOrigin}${basePath}`;
        response.headers.set(
          'Location',
          mount + location.slice(mount.length + '/en'.length)
        );
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
  }
  return target.binding.fetch(request);
}
