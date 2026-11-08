import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { isStaffOnlyWorkspaceSecretName } from '@tuturuuu/utils/staff-only-workspace-secrets';
import type { authorizeInfrastructureWorkspaceSecretsRequest } from './infrastructure-admin-access';

type AuthorizedRequest = Extract<
  Awaited<ReturnType<typeof authorizeInfrastructureWorkspaceSecretsRequest>>,
  { ok: true }
>;

/** Staff-only names (the one shared list) need a verified Tuturuuu staff session. */
export async function canMutateInfrastructureSecret(
  auth: AuthorizedRequest,
  ...names: (string | undefined | null)[]
) {
  return (
    !names.some(isStaffOnlyWorkspaceSecretName) ||
    isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(auth.sbAdmin, auth.user.id)
    )
  );
}
