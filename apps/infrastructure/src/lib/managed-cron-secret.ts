import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import type { authorizeInfrastructureWorkspaceSecretsRequest } from './infrastructure-admin-access';

// Workspace secrets that only verified Tuturuuu staff may change.
const STAFF_ONLY_SECRET_NAMES = new Set([
  'MANAGED_CRON_ENABLED',
  'ENABLE_BOARD_CYCLES',
  'AI_ENABLED',
  'AI_EDUCATION_SCOPE',
  'ENABLE_EDUCATION',
]);

type AuthorizedRequest = Extract<
  Awaited<ReturnType<typeof authorizeInfrastructureWorkspaceSecretsRequest>>,
  { ok: true }
>;

export async function canMutateInfrastructureSecret(
  auth: AuthorizedRequest,
  ...names: (string | undefined | null)[]
) {
  return (
    !names.some((name) =>
      STAFF_ONLY_SECRET_NAMES.has(name?.trim().toUpperCase() ?? '')
    ) ||
    isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(auth.sbAdmin, auth.user.id)
    )
  );
}
