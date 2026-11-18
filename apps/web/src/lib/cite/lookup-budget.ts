import 'server-only';

import {
  type ClientIpConfig,
  resolveClientIp,
  resolveTrustedProxyConfig,
  type ResolveTrustedProxyOptions,
} from '@tuturuuu/utils/abuse-protection/client-ip';
import {
  type CitationBudgetDependencies,
  reserveCitationBudget,
} from './budget-store';
import { reserveInstanceLookup } from './lookup-budget-fallback';

export const LOOKUP_IP_LIMIT = 10;
export const LOOKUP_GLOBAL_LIMIT = 120;

/** Anonymous lookups are budgeted per trusted client identity; storage outages use a conservative per-instance budget. */
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
  // Client identity comes from the deployment's trusted-proxy resolution, which
  // never honors a client-supplied Cloudflare IP without origin proof. Callers
  // whose address cannot be resolved share one bucket instead of being refused.
  const ip = resolveClientIp(headers, config);
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
