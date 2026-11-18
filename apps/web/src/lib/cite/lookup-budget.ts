import 'server-only';

import {
  type ClientIpConfig,
  isAuthenticatedCloudflareOrigin,
  resolveClientIp,
  resolveTrustedProxyConfig,
  type ResolveTrustedProxyOptions,
  UNKNOWN_CLIENT_IP,
} from '@tuturuuu/utils/abuse-protection/client-ip';
import {
  type CitationBudgetDependencies,
  reserveCitationBudget,
} from './budget-store';
import { reserveInstanceLookup } from './lookup-budget-fallback';

export const LOOKUP_IP_LIMIT = 10;
export const LOOKUP_GLOBAL_LIMIT = 120;

/** Anonymous lookups require authenticated Cloudflare origin proof before trusting any IP; storage outages use a conservative per-instance budget. */
export async function reserveCitationLookup(
  headers: Headers,
  dependencies: CitationBudgetDependencies & {
    proxyConfig?: ClientIpConfig;
    proxyOptions?: ResolveTrustedProxyOptions;
  } = {}
) {
  const config =
    dependencies.proxyConfig ??
    resolveTrustedProxyConfig(dependencies.proxyOptions);
  if (!isAuthenticatedCloudflareOrigin(headers, config))
    return { kind: 'rejected', status: 429, retryAfter: 60 } as const;
  const ip = resolveClientIp(headers, config);
  if (ip === UNKNOWN_CLIENT_IP)
    return { kind: 'rejected', status: 429, retryAfter: 60 } as const;
  const shared = await reserveCitationBudget(
    {
      scope: 'lookup',
      actor: ip,
      actorLimit: LOOKUP_IP_LIMIT,
      globalLimit: LOOKUP_GLOBAL_LIMIT,
    },
    dependencies
  );
  // An unreachable shared store degrades to the per-instance budget; a denial is final.
  return shared.kind === 'rejected' && shared.status === 503
    ? reserveInstanceLookup(ip, (dependencies.now ?? Date.now)())
    : shared;
}
