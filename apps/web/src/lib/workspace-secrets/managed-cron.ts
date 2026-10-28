import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export const MANAGED_CRON_ENABLED_SECRET = 'MANAGED_CRON_ENABLED';

export function isManagedCronEnableSecretName(name?: string | null) {
  return name?.trim().toUpperCase() === MANAGED_CRON_ENABLED_SECRET;
}

export async function canMutateManagedCronEnableSecret(request: Request) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return isVerifiedTuturuuuStaffSession(
    user &&
      (await getVerifiedAuthUser(
        await createAdminClient({ noCookie: true }),
        user.id
      ))
  );
}
