'use server';

import { createAdminClient } from '@ncthub/supabase/next/server';
import { revalidatePath } from 'next/cache';

export async function addWhitelistEmail(
  wsId: string,
  email: string,
  enabled: boolean
) {
  const sbAdmin = await createAdminClient();
  if (!sbAdmin) throw new Error('Unauthorized');

  const { error } = await sbAdmin
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
  const sbAdmin = await createAdminClient();
  if (!sbAdmin) throw new Error('Unauthorized');

  const { error } = await sbAdmin
    .from('ai_whitelisted_domains')
    .insert([{ domain, description, enabled }]);

  if (error) throw error;

  revalidatePath(`/${wsId}/settings/infrastructure/ai/whitelist`);
  return { success: true };
}
