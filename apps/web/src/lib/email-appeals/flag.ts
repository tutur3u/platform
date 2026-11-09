import { createClient } from '@tuturuuu/supabase/next/server';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const EMAIL_APPEALS_FLAG = 'email_blacklist_appeals';

export async function isEmailAppealsEnabled(wsId: string): Promise<boolean> {
  return verifySecret({
    forceAdmin: true,
    name: EMAIL_APPEALS_FLAG,
    value: 'true',
    wsId,
  });
}

export async function readEmailAppealAccess(wsId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return (
    !error &&
    isVerifiedTuturuuuStaffSession(user) &&
    (await isEmailAppealsEnabled(wsId))
  );
}
