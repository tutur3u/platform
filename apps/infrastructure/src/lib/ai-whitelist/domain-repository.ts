import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AIWhitelistDomain } from '@tuturuuu/types';

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
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const limit = parsePositiveInteger(pageSize, 10);
  const offset = (parsePositiveInteger(page, 1) - 1) * limit;
  const search = normalizeDomainSearch(q);

  let query = db
    .from('ai_whitelisted_domains')
    .select('domain, description, enabled, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.ilike('domain', search);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: data ?? [],
    count: count ?? 0,
  };
}

export async function addAIWhitelistDomain({
  description,
  domain,
  enabled,
}: Pick<AIWhitelistDomain, 'description' | 'domain' | 'enabled'>) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { data, error } = await db
    .from('ai_whitelisted_domains')
    .insert({ description, domain, enabled })
    .select('domain, description, enabled, created_at')
    .single();

  if (error) throw error;

  return data;
}

export async function updateAIWhitelistDomainEnabled(
  domain: string,
  enabled: boolean
) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { error } = await db
    .from('ai_whitelisted_domains')
    .update({ enabled })
    .eq('domain', domain);

  if (error) throw error;
}

export async function deleteAIWhitelistDomain(domain: string) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { error } = await db
    .from('ai_whitelisted_domains')
    .delete()
    .eq('domain', domain);

  if (error) throw error;
}
