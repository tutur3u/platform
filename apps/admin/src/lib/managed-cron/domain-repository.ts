import 'server-only';

import { callManagedCronRpc, ensureRpcArray } from './rpc';
import { normalizeManagedCronDomain } from './validation';

export interface ManagedCronWhitelistedDomain {
  created_at: string;
  created_by: string | null;
  description: string | null;
  domain: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

interface ListManagedCronDomainsOptions {
  page?: string;
  pageSize?: string;
  q?: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDomainSearch(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? `%${normalized.toLowerCase()}%` : null;
}

export async function listManagedCronWhitelistedDomains({
  page,
  pageSize,
  q,
}: ListManagedCronDomainsOptions = {}) {
  const limit = parsePositiveInteger(pageSize, 10);
  const offset = (parsePositiveInteger(page, 1) - 1) * limit;
  const search = normalizeDomainSearch(q);
  const payload = await callManagedCronRpc<{
    count?: number;
    data?: ManagedCronWhitelistedDomain[];
  }>('list_managed_cron_whitelisted_domains', {
    p_limit: limit,
    p_offset: offset,
    p_search: search,
  });

  return {
    count: typeof payload.count === 'number' ? payload.count : 0,
    data: ensureRpcArray<ManagedCronWhitelistedDomain>(payload.data),
  };
}

export async function listEnabledManagedCronDomains() {
  const rows = await callManagedCronRpc<Array<{ domain: string }>>(
    'list_enabled_managed_cron_domains'
  );

  return ensureRpcArray<{ domain: string }>(rows).map((row) => row.domain);
}

export async function addManagedCronWhitelistedDomain({
  actorId,
  description,
  domain,
  enabled,
}: {
  actorId: string;
  description: string | null;
  domain: string;
  enabled: boolean;
}) {
  return upsertManagedCronWhitelistedDomain({
    actorId,
    description,
    domain,
    enabled,
  });
}

export async function upsertManagedCronWhitelistedDomain({
  actorId,
  description,
  domain,
  enabled,
}: {
  actorId: string;
  description: string | null;
  domain: string;
  enabled: boolean;
}) {
  const normalizedDomain = normalizeManagedCronDomain(domain);
  return callManagedCronRpc<ManagedCronWhitelistedDomain>(
    'upsert_managed_cron_whitelisted_domain',
    {
      p_actor_id: actorId,
      p_description: description,
      p_domain: normalizedDomain,
      p_enabled: enabled,
    }
  );
}

export async function updateManagedCronWhitelistedDomainEnabled({
  actorId,
  domain,
  enabled,
}: {
  actorId: string;
  domain: string;
  enabled: boolean;
}) {
  await callManagedCronRpc('update_managed_cron_whitelisted_domain_enabled', {
    p_actor_id: actorId,
    p_domain: normalizeManagedCronDomain(domain),
    p_enabled: enabled,
  });
}

export async function deleteManagedCronWhitelistedDomain(domain: string) {
  await callManagedCronRpc('delete_managed_cron_whitelisted_domain', {
    p_domain: normalizeManagedCronDomain(domain),
  });
}
