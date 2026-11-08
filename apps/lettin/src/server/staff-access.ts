import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';

export async function isVerifiedStaff(userId: string) {
  const admin = await createAdminClient({ noCookie: true });
  return isVerifiedTuturuuuStaffSession(
    await getVerifiedAuthUser(admin, userId)
  );
}
