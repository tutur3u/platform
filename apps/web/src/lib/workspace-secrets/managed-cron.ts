import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export const MANAGED_CRON_ENABLED_SECRET = 'MANAGED_CRON_ENABLED';

// Workspace secrets that only verified Tuturuuu staff may change.
// ENABLE_BOARD_CYCLES turns on board cycles in the tasks app.
const STAFF_ONLY_SECRET_NAMES = new Set([
  MANAGED_CRON_ENABLED_SECRET,
  'ENABLE_BOARD_CYCLES',
  'AI_ENABLED',
  'AI_EDUCATION_SCOPE',
  'ENABLE_EDUCATION',
]);

export function isManagedCronEnableSecretName(name?: string | null) {
  return STAFF_ONLY_SECRET_NAMES.has(name?.trim().toUpperCase() ?? '');
}

export async function canMutateManagedCronEnableSecret(
  request: Request,
  ...names: (string | null | undefined)[]
) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  const verifiedStaff = isVerifiedTuturuuuStaffSession(
    user &&
      (await getVerifiedAuthUser(
        await createAdminClient({ noCookie: true }),
        user.id
      ))
  );
  if (!verifiedStaff) return false;
  if (
    !names.some((name) =>
      ['AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION'].includes(
        name?.trim().toUpperCase() ?? ''
      )
    )
  )
    return true;
  const rootPermissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });
  return rootPermissions?.containsPermission('manage_workspace_roles') === true;
}

// The database rejects anon/authenticated writes to the reserved secret, so
// callers that passed canMutateManagedCronEnableSecret write it with the
// service role.
export function createManagedCronSecretAdminClient() {
  return createAdminClient({ noCookie: true });
}
