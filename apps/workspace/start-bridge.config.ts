// App-owned start-bridge Worker options for workspace: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import {
  type BridgeAppConfig,
  defineBridgeAppConfig,
} from '@tuturuuu/start-bridge/start/app-config';

/** Web origin used when `INTERNAL_WEB_API_ORIGIN` is unset. */
export const DEFAULT_WEB_API_ORIGIN = 'https://tuturuuu.com';

/**
 * Hosts that run Web's `proxy.ts`. Workspace forwards every unowned `/api/*`
 * request to one of them and relies on that proxy for the API cost guard and
 * the CSRF check, so a forward target outside this list is refused.
 */
export const WEB_API_HOSTS = ['tuturuuu.com', 'web.tutur3u.com'] as const;

/** `TUTURUUU_WEB_API_HOSTS` entries must be exact, dotted DNS hostnames. */
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export interface WorkspaceApiEnv {
  /** Central Web origin for `/api/*`; unset keeps `DEFAULT_WEB_API_ORIGIN`. */
  INTERNAL_WEB_API_ORIGIN?: string;
  /**
   * Comma-separated exact hostnames of extra Web deployments (a staging Web
   * Worker or a local Web dev host) that `INTERNAL_WEB_API_ORIGIN` may name,
   * on top of `WEB_API_HOSTS`. Never derived from a request.
   */
  TUTURUUU_WEB_API_HOSTS?: string;
}

function allowedWebApiHosts(env: WorkspaceApiEnv) {
  const extra = (env.TUTURUUU_WEB_API_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => HOSTNAME.test(host));
  return new Set<string>([...WEB_API_HOSTS, ...extra]);
}

/**
 * The origin workspace forwards `/api/*` to. Unset keeps the production Web
 * origin; a set value must be an `https` origin (no credentials, port or
 * path) on an allowed Web host. Anything else throws, so the request fails
 * closed with the bridge's generic 500 instead of reaching a host that does
 * not run Web's API guard.
 */
export function resolveWebApiOrigin(env: WorkspaceApiEnv): string {
  const configured = env.INTERNAL_WEB_API_ORIGIN;
  if (configured === undefined) return DEFAULT_WEB_API_ORIGIN;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('Workspace INTERNAL_WEB_API_ORIGIN is not a valid URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !allowedWebApiHosts(env).has(url.hostname)
  )
    throw new Error(
      'Workspace INTERNAL_WEB_API_ORIGIN must be an https origin on an allowed Web host'
    );
  return url.origin;
}

export const selectWorkspaceApiOrigin: NonNullable<
  BridgeAppConfig<WorkspaceApiEnv>['apiOrigin']
> = (_request, { env }) => resolveWebApiOrigin(env);

export default defineBridgeAppConfig<WorkspaceApiEnv>({
  apiOrigin: selectWorkspaceApiOrigin,
  // Production serves Workspace at its own subdomain root and under the
  // tuturuuu.com/workspace mount; every other host gets the bridge's 404.
  mounts: { unknownHost: 'reject' },
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse: createRootResponsePolicy({ seo: appRobots }),
});
