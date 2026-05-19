import 'server-only';

import type { AIWhitelistEmail } from '@tuturuuu/types';
import { getPlatformSql } from '@/lib/database/platform-sql';

interface ListAIWhitelistEmailsOptions {
  page?: string;
  pageSize?: string;
  q?: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEmailSearch(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? `%${normalized}%` : null;
}

export async function listAIWhitelistEmails({
  q,
  page,
  pageSize,
}: ListAIWhitelistEmailsOptions = {}) {
  const sql = getPlatformSql();
  const limit = parsePositiveInteger(pageSize, 10);
  const offset = (parsePositiveInteger(page, 1) - 1) * limit;
  const search = normalizeEmailSearch(q);

  const rows = search
    ? await sql<AIWhitelistEmail[]>`
        select
          email,
          enabled,
          created_at::text as created_at
        from private.ai_whitelisted_emails
        where email ilike ${search}
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `
    : await sql<AIWhitelistEmail[]>`
        select
          email,
          enabled,
          created_at::text as created_at
        from private.ai_whitelisted_emails
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `;

  const [countRow] = search
    ? await sql<{ count: number }[]>`
        select count(*)::int as count
        from private.ai_whitelisted_emails
        where email ilike ${search}
      `
    : await sql<{ count: number }[]>`
        select count(*)::int as count
        from private.ai_whitelisted_emails
      `;

  return {
    data: rows,
    count: countRow?.count ?? 0,
  };
}

export async function addAIWhitelistEmail({
  email,
  enabled,
}: Pick<AIWhitelistEmail, 'email' | 'enabled'>) {
  const sql = getPlatformSql();

  const [row] = await sql<AIWhitelistEmail[]>`
    insert into private.ai_whitelisted_emails (
      email,
      enabled
    )
    values (
      ${email},
      ${enabled}
    )
    returning
      email,
      enabled,
      created_at::text as created_at
  `;

  return row;
}

export async function updateAIWhitelistEmailEnabled(
  email: string,
  enabled: boolean
) {
  const sql = getPlatformSql();

  await sql`
    update private.ai_whitelisted_emails
    set enabled = ${enabled}
    where email = ${email}
  `;
}

export async function deleteAIWhitelistEmail(email: string) {
  const sql = getPlatformSql();

  await sql`
    delete from private.ai_whitelisted_emails
    where email = ${email}
  `;
}

export async function isAIWhitelistEmailEnabled(email: string) {
  const sql = getPlatformSql();

  const [row] = await sql<{ enabled: boolean }[]>`
    select enabled
    from private.ai_whitelisted_emails
    where email = ${email}
    limit 1
  `;

  return row?.enabled ?? false;
}
