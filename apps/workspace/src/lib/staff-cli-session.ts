import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';

export async function isVerifiedStaffCliSession(headers: Headers) {
  const token = headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token?.startsWith('ttr_app_')) return false;
  try {
    const verification = verifyCliAccessToken(token);
    if (
      !verification.ok ||
      !isExactTuturuuuDotComEmail(verification.claims.email)
    )
      return false;
    return isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(
        await createAdminClient({ noCookie: true }),
        verification.claims.sub
      )
    );
  } catch {
    return false;
  }
}
