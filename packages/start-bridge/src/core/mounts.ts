import { normalizeBasePath } from './base-path';

/**
 * Where one compiled app artifact is served. A request's base is derived from
 * its host and path: a root host serves the app at `/`; a mount host serves
 * it only under `basePath`. Hosts compare case-insensitively and include the
 * port when one is present (`localhost:7807`).
 */
/**
 * Request header naming the resolved mount (`/meet`) for downstream auth.
 * Only the bridge sets it; any client-sent copy is removed first.
 */
export const APP_BASE_HEADER = 'x-tuturuuu-app-base';

export interface AppMountConfig {
  app: string;
  /** Hosts that serve the app at their root, e.g. `meet.tuturuuu.com`. */
  rootHosts: readonly string[];
  /** Hosts that serve the app under `basePath`, e.g. `tuturuuu.com`. */
  mountHosts?: readonly string[];
  /** The apex mount, e.g. `/meet`. Required when `mountHosts` is set. */
  basePath?: string;
  /**
   * Unlisted hosts (previews, `*.workers.dev`, local tunnels): `root`
   * (default) serves them at `/`; `reject` answers 404.
   */
  unknownHost?: 'root' | 'reject';
}

export interface ResolvedMount {
  mode: 'root' | 'mounted';
  basePath: string;
}

function hostOf(url: URL) {
  return url.host.toLowerCase();
}

/** Resolves the base for a request URL, or `null` when it is not this app's. */
export function resolveAppBase(
  url: URL,
  config: AppMountConfig
): ResolvedMount | null {
  const host = hostOf(url);
  const basePath = normalizeBasePath(config.basePath);
  const mountHosts = (config.mountHosts ?? []).map((h) => h.toLowerCase());
  if (mountHosts.includes(host)) {
    if (!basePath) throw new Error('A mounted app needs a basePath');
    const owned =
      url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
    return owned ? { mode: 'mounted', basePath } : null;
  }
  if (config.rootHosts.some((h) => h.toLowerCase() === host))
    return { mode: 'root', basePath: '' };
  return config.unknownHost === 'reject'
    ? null
    : { mode: 'root', basePath: '' };
}
