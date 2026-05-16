import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export type NovaPlatformRole = {
  allow_challenge_management: boolean | null;
  allow_manage_all_challenges: boolean | null;
  allow_role_management: boolean | null;
  enabled: boolean | null;
};

export function getNovaAppSessionUserFromRequest(
  request: Parameters<typeof getAppSessionUserFromRequest>[0]
) {
  return getAppSessionUserFromRequest(request, { targetApp: 'nova' });
}

export async function getNovaAppSessionUserFromHeaders() {
  return getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'nova' }
  );
}

export async function requireNovaAppSessionUser(): Promise<SupabaseUser> {
  const user = await getNovaAppSessionUserFromHeaders();

  if (!user?.id) {
    redirect('/login');
  }

  return user;
}

export async function getNovaPlatformRole(
  userId: string,
  sbAdmin?: TypedSupabaseClient
) {
  const client = sbAdmin ?? (await createAdminClient({ noCookie: true }));
  const { data } = await client
    .from('platform_user_roles')
    .select(
      'enabled, allow_challenge_management, allow_manage_all_challenges, allow_role_management'
    )
    .eq('user_id', userId)
    .maybeSingle();

  return data as NovaPlatformRole | null;
}

export async function requireNovaEnabledRole(user: Pick<SupabaseUser, 'id'>) {
  const role = await getNovaPlatformRole(user.id);

  if (!role?.enabled) {
    redirect('/not-whitelisted');
  }

  return role;
}
