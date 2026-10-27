import {
  type OneOriginConfig,
  readOneOriginEnv,
} from '@tuturuuu/utils/one-origin-routing';

/**
 * Mail's shared-origin mount (`tuturuuu.com/mail`). `basePathReady` stays
 * false until the Start bridge build routes under `/mail`; until then the
 * shared origin is refused and the subdomain is served unchanged. Webhooks
 * and OAuth callbacks live under `/api`, which is never redirected.
 */
export function mailOneOriginConfig(env: object): OneOriginConfig {
  const vars = env as Record<string, unknown>;
  const text = (name: string, fallback: string) =>
    typeof vars[name] === 'string' ? (vars[name] as string) : fallback;
  return {
    basePath: '/mail',
    sharedOrigin: text('NEXT_PUBLIC_WEB_APP_URL', 'https://tuturuuu.com'),
    subdomainOrigin: text('NEXT_PUBLIC_APP_URL', 'https://mail.tuturuuu.com'),
    basePathReady: false,
    machinePathPrefixes: ['/_mail'],
    ...readOneOriginEnv(vars, 'mail'),
  };
}
