'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function addWhitelistEmail(email: string, enabled: boolean) {
  const sbAdmin = await createAdminClient();
  if (!sbAdmin) throw new Error('Unauthorized');

  const { error } = await sbAdmin.from('platform_email_roles').insert([
    {
      email,
      enabled,
      allow_challenge_management: false,
      allow_role_management: false,
    },
  ]);

  if (error) throw error;

  return { success: true };
}
