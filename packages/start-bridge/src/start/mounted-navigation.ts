import { type BasePath, trimTrailingSlashes } from '../core/base-path';

/** Omitted/false preserves router behavior. A predicate can gate a staged cutover. */
export type MountedTrailingSlashPolicy<Env> = boolean | ((env: Env) => boolean);

export function mountedTrailingSlashEnabled<Env>(
  policy: MountedTrailingSlashPolicy<Env> | undefined,
  env: Env
): boolean {
  return typeof policy === 'function' ? policy(env) === true : policy === true;
}

const machinePrefixes = ['/api', '/assets', '/.well-known', '/_serverFn'];

/**
 * Canonicalize a mounted document before proxy/SSR, so the router cannot
 * substitute a 307. Keep URL encoding and query bytes (including duplicate keys).
 * Bare mount URLs already are canonical and pass through to SSR unchanged.
 */
export function canonicalizeMountedTrailingSlash(
  request: Request,
  base: BasePath,
  options: { enabled?: boolean; machinePathPrefixes?: readonly string[] } = {}
): Response | null {
  if (options.enabled !== true || base.isRoot) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (request.headers.has('upgrade')) return null;
  const mode = request.headers.get('sec-fetch-mode');
  if (
    mode
      ? mode !== 'navigate'
      : !request.headers.get('accept')?.includes('text/html')
  )
    return null;
  const url = new URL(request.url);
  const appPath = base.strip(url.pathname);
  if (appPath === null || !url.pathname.endsWith('/')) return null;
  // Repeated separators must not turn a machine path into a document. Only
  // the classification is normalized; Location retains the original encoding.
  const classified = appPath.replace(/\/{2,}/gu, '/');
  if (
    [...machinePrefixes, ...(options.machinePathPrefixes ?? [])].some(
      (prefix) => classified === prefix || classified.startsWith(`${prefix}/`)
    )
  )
    return null;
  return new Response(null, {
    status: 301,
    headers: {
      Location: `${url.origin}${trimTrailingSlashes(url.pathname)}${url.search}`,
    },
  });
}
