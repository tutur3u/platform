import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireHiveAccess() {
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'hive' }
  );

  if (!user?.id) {
    redirect('/login');
  }

  const admin = await createAdminClient();
  const [{ data: member }, { data: role }] = await Promise.all([
    admin
      .from('hive_members')
      .select('enabled')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('platform_user_roles')
      .select('enabled, allow_role_management')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const isAdmin = !!role?.enabled && !!role.allow_role_management;
  const isMember = !!member?.enabled;

  if (!(isAdmin || isMember)) {
    redirect('/not-whitelisted');
  }

  return {
    isAdmin,
    user,
  };
}
