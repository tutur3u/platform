import 'server-only';

import type { AIWhitelistDomain } from '@tuturuuu/types';
import { getPlatformSql } from '@/lib/database/platform-sql';

interface ListAIWhitelistDomainsOptions {
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
  return normalized ? `%${normalized}%` : null;
}

export async function listAIWhitelistDomains({
  q,
  page,
  pageSize,
}: ListAIWhitelistDomainsOptions = {}) {
  const sql = getPlatformSql();
  const limit = parsePositiveInteger(pageSize, 10);
  const offset = (parsePositiveInteger(page, 1) - 1) * limit;
  const search = normalizeDomainSearch(q);

  const rows = search
    ? await sql<AIWhitelistDomain[]>`
        select
          domain,
          description,
          enabled,
          created_at::text as created_at
        from private.ai_whitelisted_domains
        where domain ilike ${search}
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `
    : await sql<AIWhitelistDomain[]>`
        select
          domain,
          description,
          enabled,
          created_at::text as created_at
        from private.ai_whitelisted_domains
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `;

  const [countRow] = search
    ? await sql<{ count: number }[]>`
        select count(*)::int as count
        from private.ai_whitelisted_domains
        where domain ilike ${search}
      `
    : await sql<{ count: number }[]>`
        select count(*)::int as count
        from private.ai_whitelisted_domains
      `;

  return {
    data: rows,
    count: countRow?.count ?? 0,
  };
}

export async function addAIWhitelistDomain({
  description,
  domain,
  enabled,
}: Pick<AIWhitelistDomain, 'description' | 'domain' | 'enabled'>) {
  const sql = getPlatformSql();

  const [row] = await sql<AIWhitelistDomain[]>`
    insert into private.ai_whitelisted_domains (
      domain,
      description,
      enabled
    )
    values (
      ${domain},
      ${description},
      ${enabled}
    )
    returning
      domain,
      description,
      enabled,
      created_at::text as created_at
  `;

  return row;
}

export async function updateAIWhitelistDomainEnabled(
  domain: string,
  enabled: boolean
) {
  const sql = getPlatformSql();

  await sql`
    update private.ai_whitelisted_domains
    set enabled = ${enabled}
    where domain = ${domain}
  `;
}

export async function deleteAIWhitelistDomain(domain: string) {
  const sql = getPlatformSql();

  await sql`
    delete from private.ai_whitelisted_domains
    where domain = ${domain}
  `;
}
