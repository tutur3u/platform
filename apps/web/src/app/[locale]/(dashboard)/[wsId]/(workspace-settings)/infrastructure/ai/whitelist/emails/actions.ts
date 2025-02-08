'use server';

import { createAdminClient } from '@repo/supabase/next/server';
import { revalidatePath } from 'next/cache';

export async function addWhitelistEmail(
  wsId: string,
  email: string,
  enabled: boolean
) {
  const supabase = await createAdminClient();
  if (!supabase) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('ai_whitelisted_emails')
    .insert([{ email, enabled }]);

  if (error) throw error;

  revalidatePath(`/${wsId}/settings/infrastructure/ai/whitelist`);
  return { success: true };
}

export async function addWhitelistDomain(
  wsId: string,
  domain: string,
  description: string | null,
  enabled: boolean
) {
  const supabase = await createAdminClient();
  if (!supabase) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('ai_whitelisted_domains')
    .insert([{ domain, description, enabled }]);

  if (error) throw error;

  revalidatePath(`/${wsId}/settings/infrastructure/ai/whitelist`);
  return { success: true };
}
