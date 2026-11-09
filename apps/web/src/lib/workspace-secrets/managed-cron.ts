import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export const MANAGED_CRON_ENABLED_SECRET = 'MANAGED_CRON_ENABLED';
// Covers every staff-only secret: the one list in @tuturuuu/utils.
export { isStaffOnlyWorkspaceSecretName as isManagedCronEnableSecretName } from '@tuturuuu/utils/staff-only-workspace-secrets';

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

// The database rejects anon/authenticated writes to the reserved secret, so
// callers that passed canMutateManagedCronEnableSecret write it with the
// service role.
export function createManagedCronSecretAdminClient() {
  return createAdminClient({ noCookie: true });
}
