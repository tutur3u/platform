import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import type { authorizeInfrastructureWorkspaceSecretsRequest } from './infrastructure-admin-access';

type AuthorizedRequest = Extract<
  Awaited<ReturnType<typeof authorizeInfrastructureWorkspaceSecretsRequest>>,
  { ok: true }
>;

export async function canMutateInfrastructureSecret(
  auth: AuthorizedRequest,
  ...names: (string | undefined | null)[]
) {
  return (
    !names.some(
      (name) => name?.trim().toUpperCase() === 'MANAGED_CRON_ENABLED'
    ) ||
    isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(auth.sbAdmin, auth.user.id)
    )
  );
}
