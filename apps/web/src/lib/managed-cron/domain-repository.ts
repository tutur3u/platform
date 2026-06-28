import 'server-only';

import type { Sql } from 'postgres';
import { getPlatformSql } from '@/lib/database/platform-sql';
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
  const sql = getPlatformSql();
  const limit = parsePositiveInteger(pageSize, 10);
  const offset = (parsePositiveInteger(page, 1) - 1) * limit;
  const search = normalizeDomainSearch(q);

  const rows = search
    ? await sql<ManagedCronWhitelistedDomain[]>`
        select
          domain,
          description,
          enabled,
          created_at::text as created_at,
          updated_at::text as updated_at,
          created_by::text as created_by,
          updated_by::text as updated_by
        from private.managed_cron_whitelisted_domains
        where domain ilike ${search}
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `
    : await sql<ManagedCronWhitelistedDomain[]>`
        select
          domain,
          description,
          enabled,
          created_at::text as created_at,
          updated_at::text as updated_at,
          created_by::text as created_by,
          updated_by::text as updated_by
        from private.managed_cron_whitelisted_domains
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `;

  const [countRow] = search
    ? await sql<{ count: number }[]>`
        select count(*)::int as count
        from private.managed_cron_whitelisted_domains
        where domain ilike ${search}
      `
    : await sql<{ count: number }[]>`
        select count(*)::int as count
        from private.managed_cron_whitelisted_domains
      `;

  return {
    count: countRow?.count ?? 0,
    data: rows,
  };
}

export async function listEnabledManagedCronDomains() {
  const sql = getPlatformSql();
  return listEnabledManagedCronDomainsWithSql(sql);
}

export async function listEnabledManagedCronDomainsWithSql(sql: Sql) {
  const rows = await sql<{ domain: string }[]>`
    select domain
    from private.managed_cron_whitelisted_domains
    where enabled = true
    order by domain asc
  `;

  return rows.map((row) => row.domain);
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
  const sql = getPlatformSql();
  const normalizedDomain = normalizeManagedCronDomain(domain);
  const [row] = await sql<ManagedCronWhitelistedDomain[]>`
    insert into private.managed_cron_whitelisted_domains (
      domain,
      description,
      enabled,
      created_by,
      updated_by
    )
    values (
      ${normalizedDomain},
      ${description},
      ${enabled},
      ${actorId},
      ${actorId}
    )
    returning
      domain,
      description,
      enabled,
      created_at::text as created_at,
      updated_at::text as updated_at,
      created_by::text as created_by,
      updated_by::text as updated_by
  `;

  return row;
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
  const sql = getPlatformSql();
  const normalizedDomain = normalizeManagedCronDomain(domain);
  const [row] = await sql<ManagedCronWhitelistedDomain[]>`
    insert into private.managed_cron_whitelisted_domains (
      domain,
      description,
      enabled,
      created_by,
      updated_by
    )
    values (
      ${normalizedDomain},
      ${description},
      ${enabled},
      ${actorId},
      ${actorId}
    )
    on conflict (domain)
    do update set
      description = coalesce(excluded.description, private.managed_cron_whitelisted_domains.description),
      enabled = excluded.enabled,
      updated_at = now(),
      updated_by = excluded.updated_by
    returning
      domain,
      description,
      enabled,
      created_at::text as created_at,
      updated_at::text as updated_at,
      created_by::text as created_by,
      updated_by::text as updated_by
  `;

  return row;
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
  const sql = getPlatformSql();
  await sql`
    update private.managed_cron_whitelisted_domains
    set
      enabled = ${enabled},
      updated_at = now(),
      updated_by = ${actorId}
    where domain = ${normalizeManagedCronDomain(domain)}
  `;
}

export async function deleteManagedCronWhitelistedDomain(domain: string) {
  const sql = getPlatformSql();
  await sql`
    delete from private.managed_cron_whitelisted_domains
    where domain = ${normalizeManagedCronDomain(domain)}
  `;
}
