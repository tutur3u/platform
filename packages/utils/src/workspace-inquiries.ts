import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isVerifiedTuturuuuStaffSession } from './email/staff-session';

export async function getUnresolvedInquiriesCount() {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!isVerifiedTuturuuuStaffSession(user, { allowXwf: true }))
    return { count: 0, latestDate: null };
  const admin = await createAdminClient();
  const { count } = await admin
    .from('support_inquiries')
    .select('*', { count: 'exact', head: true })
    .eq('is_resolved', false);
  const { data } = await admin
    .from('support_inquiries')
    .select('created_at')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { count: count || 0, latestDate: data?.created_at || null };
}
