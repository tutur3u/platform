import {
  hasInternalParleyDomain,
  normalizeParleyEmail,
} from './parley/access-policy';
import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { parleyDatabase } from './parley/database';

/** Read live auth identity so changed or unconfirmed email claims grant nothing. */
export async function hasParleyAccess(userId: string): Promise<boolean> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) throw new Error('Parley identity lookup failed');
  const email = normalizeParleyEmail(data.user?.email);
  if (
    !email ||
    !data.user?.email_confirmed_at ||
    (data.user.banned_until &&
      new Date(data.user.banned_until).getTime() > Date.now())
  )
    return false;
  if (hasInternalParleyDomain(email)) return true;
  const { data: entry, error: accessError } = await (await parleyDatabase())
    .schema('private')
    .from('parley_members')
    .select('enabled')
    .eq('email', email)
    .maybeSingle();
  if (accessError) throw new Error('Parley access lookup failed');
  return entry?.enabled === true;
}
