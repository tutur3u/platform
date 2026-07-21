import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AIWhitelistEmail } from '@tuturuuu/types';

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
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const limit = parsePositiveInteger(pageSize, 10);
  const offset = (parsePositiveInteger(page, 1) - 1) * limit;
  const search = normalizeEmailSearch(q);

  let query = db
    .from('ai_whitelisted_emails')
    .select('email, enabled, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.ilike('email', search);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: data ?? [],
    count: count ?? 0,
  };
}

export async function addAIWhitelistEmail({
  email,
  enabled,
}: Pick<AIWhitelistEmail, 'email' | 'enabled'>) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { data, error } = await db
    .from('ai_whitelisted_emails')
    .insert({ email, enabled })
    .select('email, enabled, created_at')
    .single();

  if (error) throw error;

  return data;
}

export async function updateAIWhitelistEmailEnabled(
  email: string,
  enabled: boolean
) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { error } = await db
    .from('ai_whitelisted_emails')
    .update({ enabled })
    .eq('email', email);

  if (error) throw error;
}

export async function deleteAIWhitelistEmail(email: string) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { error } = await db
    .from('ai_whitelisted_emails')
    .delete()
    .eq('email', email);

  if (error) throw error;
}

export async function isAIWhitelistEmailEnabled(email: string) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { data, error } = await db
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;

  return data?.enabled ?? false;
}
