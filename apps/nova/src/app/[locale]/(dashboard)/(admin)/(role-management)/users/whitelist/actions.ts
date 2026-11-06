'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { requireNovaAppSessionUser } from '@/lib/app-session';
import { canManageNovaRolesGlobally } from '@/lib/challenge-management-auth';

export async function addWhitelistEmail(email: string, enabled: boolean) {
  const user = await requireNovaAppSessionUser();
  const sbAdmin = await createAdminClient({ noCookie: true });
  if (!(await canManageNovaRolesGlobally(user, sbAdmin))) {
    throw new Error('Forbidden');
  }

  const { error } = await sbAdmin.from('platform_email_roles').insert([
    {
      email,
      enabled,
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: false,
    },
  ]);

  if (error) throw error;

  return { success: true };
}
