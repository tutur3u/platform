import 'server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import { hasParleyAccess } from '../parley-access';

export async function requireParleyUser() {
  const user = await getSatelliteAppSessionUser('parley');
  if (!user?.id) redirect('/login');
  if (!(await hasParleyAccess(user.id))) redirect('/access-denied');
  return user;
}
export async function requireParleyAdministrator() {
  const user = await getSatelliteAppSessionUser('infra');
  if (!user?.id) throw new Error('Unauthorized');
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('platform_user_roles')
    .select('enabled, allow_role_management')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data?.enabled || !data.allow_role_management)
    throw new Error('Forbidden');
  return user;
}
