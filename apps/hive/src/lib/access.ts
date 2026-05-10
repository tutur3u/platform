import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';

export async function requireHiveAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
