import {
  type OneOriginConfig,
  readOneOriginEnv,
} from '@tuturuuu/utils/one-origin-routing';

/**
 * Meet's shared-origin mount (`tuturuuu.com/meet`). `basePathReady` stays
 * false until the Start bridge build routes under `/meet`; until then the
 * shared origin is refused and the subdomain is served unchanged.
 */
export function meetOneOriginConfig(env: object): OneOriginConfig {
  const vars = env as Record<string, unknown>;
  const text = (name: string, fallback: string) =>
    typeof vars[name] === 'string' ? (vars[name] as string) : fallback;
  return {
    basePath: '/meet',
    sharedOrigin: text('NEXT_PUBLIC_WEB_APP_URL', 'https://tuturuuu.com'),
    subdomainOrigin: text('NEXT_PUBLIC_APP_URL', 'https://meet.tuturuuu.com'),
    basePathReady: false,
    machinePathPrefixes: ['/live-connect', '/_meet', '/_rum'],
    ...readOneOriginEnv(vars, 'meet'),
  };
}
