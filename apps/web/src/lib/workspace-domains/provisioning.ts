import {
  CloudflareApiError,
  type CloudflareDomainsClient,
  workerRouteMatchesHost,
} from './cloudflare';

export type HostnameClaim =
  | 'dns_record'
  | 'wildcard_dns_record'
  | 'worker_route'
  | 'provider_conflict'
  | 'platform_disabled';

/** The hostname already belongs to something else on the zone. */
export class HostnameInUseError extends Error {
  constructor(readonly claim: HostnameClaim) {
    super(`hostname_in_use:${claim}`);
  }
}

/** `*.<parent>` names whose wildcard record would already answer for host. */
export function coveringWildcardNames(hostname: string, zone: string) {
  const labels = hostname.split('.');
  const names: string[] = [];
  for (let index = 1; index < labels.length; index += 1) {
    const parent = labels.slice(index).join('.');
    if (parent.length < zone.length) break;
    names.push(`*.${parent}`);
    if (parent === zone) break;
  }
  return names;
}

async function assertNoWorkerRoute(
  cloudflare: CloudflareDomainsClient,
  hostname: string
) {
  const routes = await cloudflare.listWorkerRoutes();
  if (routes.some((route) => workerRouteMatchesHost(route.pattern, hostname))) {
    throw new HostnameInUseError('worker_route');
  }
}

/**
 * Refuses a platform subdomain that the zone already answers for: any DNS
 * record at the name (all types), a covering wildcard record, or any Workers
 * route whose pattern matches the host (exact or wildcard).
 */
export async function assertPlatformHostnameUnclaimed(
  cloudflare: CloudflareDomainsClient,
  hostname: string,
  platformApex: string | null
) {
  if (!platformApex) throw new HostnameInUseError('platform_disabled');
  if ((await cloudflare.listDnsRecords(hostname)).length > 0) {
    throw new HostnameInUseError('dns_record');
  }
  for (const wildcard of coveringWildcardNames(hostname, platformApex)) {
    if ((await cloudflare.listDnsRecords(wildcard)).length > 0) {
      throw new HostnameInUseError('wildcard_dns_record');
    }
  }
  await assertNoWorkerRoute(cloudflare, hostname);
}

function asClaim(error: unknown): never {
  if (error instanceof CloudflareApiError && error.conflict) {
    throw new HostnameInUseError('provider_conflict');
  }
  throw error;
}

/**
 * Creates the proxied record and Worker route for `<label>.<apex>` as one
 * unit: preflight, create both, and delete whatever this attempt created if
 * any step fails (a create conflict included), so no partial state remains.
 */
export async function provisionPlatformSubdomain(
  cloudflare: CloudflareDomainsClient,
  hostname: string,
  platformApex: string | null
): Promise<{ dnsRecordId: string; routeId: string }> {
  await assertPlatformHostnameUnclaimed(cloudflare, hostname, platformApex);
  let dnsRecordId: string | null = null;
  try {
    dnsRecordId = await cloudflare.createPlatformRecord(hostname);
    const routeId = await cloudflare.createWorkerRoute(hostname);
    return { dnsRecordId, routeId };
  } catch (error) {
    if (dnsRecordId) {
      await cloudflare.deleteDnsRecord(dnsRecordId).catch(() => {
        console.error('workspace-domains: rollback of platform record failed', {
          hostname,
        });
      });
    }
    return asClaim(error);
  }
}

/** Attaches the edge Worker route, refusing hosts another route already owns. */
export async function attachWorkerRoute(
  cloudflare: CloudflareDomainsClient,
  hostname: string
) {
  await assertNoWorkerRoute(cloudflare, hostname);
  try {
    return await cloudflare.createWorkerRoute(hostname);
  } catch (error) {
    return asClaim(error);
  }
}
