import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import {
  classifyWorkspaceDomainHostname,
  WORKSPACE_DOMAIN_CNAME_TARGET,
} from '@tuturuuu/utils/workspace-domain-hostnames';
import {
  CloudflareApiError,
  type CloudflareDomainsClient,
  customHostnameDnsRecords,
} from './cloudflare';
import {
  isVerifiedStaffUser,
  isWorkspaceDomainsBillingEnabled,
  isWorkspaceDomainsEnabled,
  readWorkspaceDomainEntitlement,
  WORKSPACE_DOMAIN_ADDON_PRICE_USD,
  type WorkspaceDomainActor,
  type WorkspaceDomainEntitlement,
} from './entitlement';
import {
  createOwnershipTxtValue,
  hasOwnershipProof,
  ownershipTxtName,
} from './ownership';

type DomainRow = Database['public']['Tables']['workspace_domains']['Row'];
type AuditAction =
  Database['private']['Tables']['workspace_domain_audit']['Insert']['action'];

export class WorkspaceDomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

export interface WorkspaceDomainDeps {
  admin: TypedSupabaseClient;
  cloudflare: CloudflareDomainsClient | null;
  fetch?: typeof fetch;
}

export interface PublicWorkspaceDomain {
  id: string;
  hostname: string;
  kind: string;
  status: string;
  ownershipStatus: string | null;
  sslStatus: string | null;
  entitlementSource: string;
  error: string | null;
  ownershipRecord: { type: 'TXT'; name: string; value: string } | null;
  routingRecord: { type: 'CNAME'; name: string; value: string } | null;
  providerRecords: Json;
  createdAt: string;
  lastCheckedAt: string | null;
  activatedAt: string | null;
}

const DOMAIN_COLUMNS =
  'id, ws_id, hostname, kind, status, verification_txt_name, verification_txt_value, ownership_status, ssl_status, dns_records, cloudflare_custom_hostname_id, cloudflare_dns_record_id, cloudflare_worker_route_id, entitlement_source, error, created_by, created_at, updated_at, last_checked_at, activated_at, removed_at';

export function toPublicDomain(row: DomainRow): PublicWorkspaceDomain {
  const custom = row.kind === 'custom';
  return {
    id: row.id,
    hostname: row.hostname,
    kind: row.kind,
    status: row.status,
    ownershipStatus: row.ownership_status,
    sslStatus: row.ssl_status,
    entitlementSource: row.entitlement_source,
    error: row.error,
    ownershipRecord: custom
      ? {
          type: 'TXT',
          name: row.verification_txt_name,
          value: row.verification_txt_value,
        }
      : null,
    routingRecord: custom
      ? {
          type: 'CNAME',
          name: row.hostname,
          value: WORKSPACE_DOMAIN_CNAME_TARGET,
        }
      : null,
    providerRecords: row.dns_records,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    activatedAt: row.activated_at,
  };
}

/** Audit without DNS tokens, provider identifiers or credentials. */
async function audit(
  admin: TypedSupabaseClient,
  entry: {
    wsId: string;
    domainId?: string | null;
    hostname: string;
    action: AuditAction;
    actorId: string | null;
    entitlementSource?: string | null;
    detail?: Record<string, string | number | boolean | null>;
  }
) {
  const { error } = await admin
    .schema('private')
    .from('workspace_domain_audit')
    .insert({
      ws_id: entry.wsId,
      domain_id: entry.domainId ?? null,
      hostname: entry.hostname.slice(0, 253),
      action: entry.action,
      actor_id: entry.actorId,
      entitlement_source: entry.entitlementSource ?? null,
      detail: entry.detail ?? {},
    });
  if (error) {
    console.error('workspace-domains: audit insert failed', {
      action: entry.action,
      code: error.code,
    });
  }
}

async function loadDomain(
  admin: TypedSupabaseClient,
  wsId: string,
  domainId: string
): Promise<DomainRow> {
  const { data, error } = await admin
    .from('workspace_domains')
    .select(DOMAIN_COLUMNS)
    .eq('ws_id', wsId)
    .eq('id', domainId)
    .neq('status', 'removed')
    .maybeSingle();
  if (error) throw new WorkspaceDomainError(503, 'domains_unavailable');
  if (!data) throw new WorkspaceDomainError(404, 'domain_not_found');
  return data as DomainRow;
}

async function updateDomain(
  admin: TypedSupabaseClient,
  id: string,
  patch: Database['public']['Tables']['workspace_domains']['Update']
): Promise<DomainRow> {
  const { data, error } = await admin
    .from('workspace_domains')
    .update(patch)
    .eq('id', id)
    .select(DOMAIN_COLUMNS)
    .single();
  if (error || !data)
    throw new WorkspaceDomainError(503, 'domains_unavailable');
  return data as DomainRow;
}

export async function listWorkspaceDomains(
  deps: WorkspaceDomainDeps,
  wsId: string,
  actor: WorkspaceDomainActor
) {
  const [{ data, error }, entitlement] = await Promise.all([
    deps.admin
      .from('workspace_domains')
      .select(DOMAIN_COLUMNS)
      .eq('ws_id', wsId)
      .neq('status', 'removed')
      .order('created_at', { ascending: true }),
    readWorkspaceDomainEntitlement(deps.admin, wsId, actor),
  ]);
  if (error) throw new WorkspaceDomainError(503, 'domains_unavailable');
  return {
    domains: ((data ?? []) as DomainRow[]).map(toPublicDomain),
    entitlement,
    billing: {
      checkoutEnabled: isWorkspaceDomainsBillingEnabled(),
      pricePerDomainMonthlyUsd: WORKSPACE_DOMAIN_ADDON_PRICE_USD,
    },
    cnameTarget: WORKSPACE_DOMAIN_CNAME_TARGET,
    providerConfigured: deps.cloudflare !== null,
  };
}

function denyCode(entitlement: WorkspaceDomainEntitlement) {
  return `entitlement_${entitlement.reason}`;
}

export async function addWorkspaceDomain(
  deps: WorkspaceDomainDeps,
  wsId: string,
  actor: WorkspaceDomainActor,
  rawHostname: string
) {
  const classified = classifyWorkspaceDomainHostname(rawHostname);
  if (!classified.ok) {
    throw new WorkspaceDomainError(400, `hostname_${classified.reason}`);
  }
  const { hostname, kind } = classified;

  const entitlement = await readWorkspaceDomainEntitlement(
    deps.admin,
    wsId,
    actor
  );
  if (!entitlement.allowed || !entitlement.source) {
    await audit(deps.admin, {
      wsId,
      hostname,
      action: 'denied',
      actorId: actor.id,
      detail: { reason: entitlement.reason },
    });
    throw new WorkspaceDomainError(403, denyCode(entitlement));
  }

  const { data, error } = await deps.admin
    .from('workspace_domains')
    .insert({
      ws_id: wsId,
      hostname,
      kind,
      verification_txt_name: ownershipTxtName(hostname),
      verification_txt_value: createOwnershipTxtValue(),
      ownership_status: kind === 'platform_subdomain' ? 'verified' : 'pending',
      entitlement_source: entitlement.source,
      created_by: actor.id,
    })
    .select(DOMAIN_COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === '23505') {
      throw new WorkspaceDomainError(409, 'hostname_unavailable');
    }
    if (error?.code === '23514') {
      throw new WorkspaceDomainError(409, 'entitlement_cap_reached');
    }
    if (error?.code === '42501') {
      throw new WorkspaceDomainError(403, 'entitlement_kill_switch');
    }
    throw new WorkspaceDomainError(503, 'domains_unavailable');
  }

  const row = data as DomainRow;
  await audit(deps.admin, {
    wsId,
    domainId: row.id,
    hostname,
    action: 'add',
    actorId: actor.id,
    entitlementSource: entitlement.source,
    detail: { kind },
  });

  // Platform subdomains need no customer DNS: provision right away.
  if (kind === 'platform_subdomain') {
    return verifyWorkspaceDomain(deps, wsId, actor, row.id);
  }
  return toPublicDomain(row);
}

async function stillEntitled(
  deps: WorkspaceDomainDeps,
  row: DomainRow,
  actor: WorkspaceDomainActor
) {
  if (row.entitlement_source === 'staff_bypass') {
    return isVerifiedStaffUser(deps.admin, row.created_by);
  }
  const entitlement = await readWorkspaceDomainEntitlement(
    deps.admin,
    row.ws_id,
    actor
  );
  return (
    entitlement.source === 'paid_addon' && entitlement.used <= entitlement.total
  );
}

/**
 * Idempotent status refresh: ownership proof, then provider provisioning,
 * then the Worker route. Each created provider resource is persisted before
 * the next step so a retry resumes instead of duplicating.
 */
export async function verifyWorkspaceDomain(
  deps: WorkspaceDomainDeps,
  wsId: string,
  actor: WorkspaceDomainActor,
  domainId: string
): Promise<PublicWorkspaceDomain> {
  let row = await loadDomain(deps.admin, wsId, domainId);
  const now = new Date().toISOString();

  if (!(await isWorkspaceDomainsEnabled(deps.admin))) {
    throw new WorkspaceDomainError(403, 'entitlement_kill_switch');
  }
  if (!(await stillEntitled(deps, row, actor))) {
    row = await updateDomain(deps.admin, row.id, {
      status: 'suspended',
      error: 'entitlement_lapsed',
      last_checked_at: now,
    });
    await audit(deps.admin, {
      wsId,
      domainId: row.id,
      hostname: row.hostname,
      action: 'suspend',
      actorId: actor.id,
      entitlementSource: row.entitlement_source,
    });
    return toPublicDomain(row);
  }

  if (row.kind === 'custom') {
    const proof = await hasOwnershipProof(
      row.hostname,
      row.verification_txt_value,
      deps.fetch
    );
    if (proof !== true) {
      row = await updateDomain(deps.admin, row.id, {
        status: 'pending_verification',
        ownership_status: 'pending',
        error: proof === null ? 'dns_lookup_failed' : 'ownership_txt_missing',
        last_checked_at: now,
      });
      return toPublicDomain(row);
    }
  }

  if (!deps.cloudflare) {
    row = await updateDomain(deps.admin, row.id, {
      status: 'verifying',
      ownership_status: 'verified',
      error: 'provider_not_configured',
      last_checked_at: now,
    });
    return toPublicDomain(row);
  }

  const cloudflare = deps.cloudflare;
  try {
    let ready = false;
    if (row.kind === 'custom') {
      const hostname = row.cloudflare_custom_hostname_id
        ? await cloudflare.getCustomHostname(row.cloudflare_custom_hostname_id)
        : await cloudflare.createCustomHostname(row.hostname);
      row = await updateDomain(deps.admin, row.id, {
        cloudflare_custom_hostname_id: hostname.id,
        ownership_status: 'verified',
        ssl_status: hostname.ssl?.status?.slice(0, 50) ?? null,
        dns_records: customHostnameDnsRecords(hostname) as Json,
      });
      ready = hostname.status === 'active' && hostname.ssl?.status === 'active';
    } else {
      if (!row.cloudflare_dns_record_id) {
        const recordId = await cloudflare.createPlatformRecord(row.hostname);
        row = await updateDomain(deps.admin, row.id, {
          cloudflare_dns_record_id: recordId,
          ssl_status: 'active',
        });
      }
      ready = true;
    }

    if (ready && !row.cloudflare_worker_route_id) {
      const routeId = await cloudflare.createWorkerRoute(row.hostname);
      row = await updateDomain(deps.admin, row.id, {
        cloudflare_worker_route_id: routeId,
      });
    }

    const active = ready && Boolean(row.cloudflare_worker_route_id);
    const wasActive = row.status === 'active';
    row = await updateDomain(deps.admin, row.id, {
      status: active ? 'active' : 'verifying',
      activated_at: active ? (row.activated_at ?? now) : row.activated_at,
      error: null,
      last_checked_at: now,
    });
    await audit(deps.admin, {
      wsId,
      domainId: row.id,
      hostname: row.hostname,
      action: active && !wasActive ? 'activate' : 'verify',
      actorId: actor.id,
      entitlementSource: row.entitlement_source,
      detail: { status: row.status },
    });
    return toPublicDomain(row);
  } catch (error) {
    if (!(error instanceof CloudflareApiError)) throw error;
    row = await updateDomain(deps.admin, row.id, {
      error: `provider_error_${error.status}`,
      last_checked_at: now,
    });
    await audit(deps.admin, {
      wsId,
      domainId: row.id,
      hostname: row.hostname,
      action: 'provider_error',
      actorId: actor.id,
      detail: { status: error.status, codes: error.codes.join(',') },
    });
    return toPublicDomain(row);
  }
}

/** Detaches provider resources (best effort) and marks the binding removed. */
export async function removeWorkspaceDomain(
  deps: WorkspaceDomainDeps,
  wsId: string,
  actor: WorkspaceDomainActor,
  domainId: string
) {
  const row = await loadDomain(deps.admin, wsId, domainId);
  let providerError: string | null = null;
  if (deps.cloudflare) {
    try {
      if (row.cloudflare_worker_route_id) {
        await deps.cloudflare.deleteWorkerRoute(row.cloudflare_worker_route_id);
      }
      if (row.cloudflare_dns_record_id) {
        await deps.cloudflare.deleteDnsRecord(row.cloudflare_dns_record_id);
      }
      if (row.cloudflare_custom_hostname_id) {
        await deps.cloudflare.deleteCustomHostname(
          row.cloudflare_custom_hostname_id
        );
      }
    } catch (error) {
      providerError =
        error instanceof CloudflareApiError
          ? `provider_cleanup_${error.status}`
          : 'provider_cleanup_failed';
    }
  } else if (
    row.cloudflare_worker_route_id ||
    row.cloudflare_dns_record_id ||
    row.cloudflare_custom_hostname_id
  ) {
    providerError = 'provider_not_configured';
  }

  const now = new Date().toISOString();
  await updateDomain(deps.admin, row.id, {
    status: 'removed',
    removed_at: now,
    error: providerError,
  });
  await audit(deps.admin, {
    wsId,
    domainId: row.id,
    hostname: row.hostname,
    action: 'remove',
    actorId: actor.id,
    entitlementSource: row.entitlement_source,
    detail: { providerCleanup: providerError ?? 'ok' },
  });
  return {
    id: row.id,
    hostname: row.hostname,
    providerCleanupPending: Boolean(providerError),
  };
}
