import {
  type OneOriginConfig,
  readOneOriginEnv,
} from '@tuturuuu/utils/one-origin-routing';
import { mailMachinePathPrefixes } from './mail-mount';
import { publicAssets } from './public-assets';

/**
 * Mail's shared-origin mount (`tuturuuu.com/mail`). The Start bridge build
 * routes under `/mail`, so `basePathReady` is true and the same artifact
 * serves `mail.tuturuuu.com` and the apex. Admission stays with
 * `TTR_ONE_ORIGIN_MAIL`: unset or `off` refuses the apex mount, `shadow`
 * serves both hosts with the apex noindex, and only `on` redirects subdomain
 * navigations. Webhooks and OAuth callbacks live under `/api`, which is never
 * redirected; the handoff return `/verify-token` and the machine prefixes
 * below are served on the subdomain in every mode.
 */
export function mailOneOriginConfig(env: object): OneOriginConfig {
  const vars = env as Record<string, unknown>;
  const text = (name: string, fallback: string) =>
    typeof vars[name] === 'string' ? (vars[name] as string) : fallback;
  return {
    basePath: '/mail',
    sharedOrigin: text('NEXT_PUBLIC_WEB_APP_URL', 'https://tuturuuu.com'),
    subdomainOrigin: text('NEXT_PUBLIC_APP_URL', 'https://mail.tuturuuu.com'),
    basePathReady: true,
    machinePathPrefixes: mailMachinePathPrefixes,
    machinePaths: publicAssets,
    ...readOneOriginEnv(vars, 'mail'),
  };
}
