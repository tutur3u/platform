import 'server-only';
import { randomUUID } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { coordinate, coordinationKey } from '@tuturuuu/utils/coordination';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { REQUIRED_MFA_POLICY_KEY } from '@tuturuuu/utils/required-mfa-policy';
import { InternalAccountAdminError } from './errors';
import { transitionAccountMfaPolicy } from './policy-transition';

/** Operator enables this only after the schema and all application gates have
 * been deployed and verified. Schema readiness alone is insufficient. */
export async function isRequiredMfaPolicyAvailable(admin: TypedSupabaseClient) {
  if (process.env.REQUIRED_MFA_POLICY_ENABLED !== 'true') return false;
  try {
    const { data, error } = await admin.rpc('required_mfa_enforcement_version');
    return !error && data === 1;
  } catch {
    return false;
  }
}

export async function setInternalAccountMfaPolicy({
  actorUserId,
  targetUserId,
  confirmationEmail,
  required,
  sbAdmin,
}: {
  actorUserId: string;
  targetUserId: string;
  confirmationEmail: string;
  required: boolean;
  sbAdmin: TypedSupabaseClient;
}) {
  if (actorUserId === targetUserId)
    throw new InternalAccountAdminError(
      'You cannot change your own MFA policy here',
      409
    );
  if (!(await isRequiredMfaPolicyAvailable(sbAdmin)))
    throw new InternalAccountAdminError(
      'Required MFA is not available yet',
      503
    );
  const lease = {
    namespace: 'authenticator' as const,
    key: coordinationKey(targetUserId),
    owner: randomUUID(),
  };
  const acquired = await coordinate({ ...lease, action: 'acquire' });
  if (acquired.outcome !== 'acquired')
    throw new InternalAccountAdminError(
      'Another authenticator change is in progress',
      409
    );
  try {
    const { data, error } = await sbAdmin.auth.admin.getUserById(targetUserId);
    const user = data.user;
    if (
      error ||
      !user ||
      user.id !== targetUserId ||
      !isExactTuturuuuDotComEmail(user.email)
    ) {
      throw new InternalAccountAdminError('Internal account not found', 404);
    }
    if (
      user.email?.trim().toLowerCase() !==
      confirmationEmail.trim().toLowerCase()
    ) {
      throw new InternalAccountAdminError(
        'Confirmation email does not match the target account',
        400
      );
    }
    if ((await coordinate({ ...lease, action: 'check' })).outcome !== 'owned') {
      throw new InternalAccountAdminError('Unable to update MFA policy', 503);
    }
    await transitionAccountMfaPolicy(
      sbAdmin,
      targetUserId,
      user.app_metadata?.[REQUIRED_MFA_POLICY_KEY],
      { required }
    );
    const updated = await sbAdmin.auth.admin.getUserById(targetUserId);
    if (updated.error || !updated.data.user)
      throw new InternalAccountAdminError(
        'Unable to read updated MFA policy',
        503
      );
    console.info('Internal account MFA policy updated', {
      actorUserId,
      targetUserId,
      required,
    });
    return updated.data.user;
  } finally {
    await coordinate({ ...lease, action: 'release' }).catch(() => {
      console.warn('Could not release account MFA policy lease');
    });
  }
}
