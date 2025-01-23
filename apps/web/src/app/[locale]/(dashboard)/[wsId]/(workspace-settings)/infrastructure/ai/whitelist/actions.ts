'use server';

import { createAdminClient } from '@/utils/supabase/server';
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