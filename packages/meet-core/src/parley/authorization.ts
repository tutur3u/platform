import 'server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { notFound, redirect } from 'next/navigation';
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
  if (!(await hasParleyAdministratorRole(user.id)))
    throw new Error('Forbidden');
  return user;
}
export async function hasParleyAdministratorRole(userId: string) {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('platform_user_roles')
    .select('enabled, allow_role_management')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Parley administrator lookup failed');
  return data?.enabled === true && data.allow_role_management === true;
}
export async function requireParleyStudioAdministrator() {
  const user = await requireParleyUser();
  if (!(await hasParleyAdministratorRole(user.id))) notFound();
  return user;
}
