import 'server-only';
import { randomUUID } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { coordinate, coordinationKey } from '@tuturuuu/utils/coordination';
import {
  REQUIRED_MFA_POLICY_KEY,
  readRequiredMfaPolicy,
} from '@tuturuuu/utils/required-mfa-policy';
import { InternalAccountAdminError } from './errors';
import { transitionAccountMfaPolicy } from './policy-transition';

export function accountRecoveryPolicy(inProgress: boolean) {
  const boundary = Math.floor(Date.now() / 1000);
  return {
    [REQUIRED_MFA_POLICY_KEY]: {
      required: true,
      verifiedAfter: boundary,
      primaryVerifiedAfter: boundary,
      recoveryInProgress: inProgress,
    },
  };
}

/** Password recovery and factor/policy mutations share a lease. Read policy
 * under that lease; on partial recovery failure keep required accounts blocked. */
export async function recoverAccountPassword(
  admin: TypedSupabaseClient,
  targetUserId: string,
  password: string,
  expectedEmail: string
) {
  const lease = {
    namespace: 'authenticator' as const,
    key: coordinationKey(targetUserId),
    owner: randomUUID(),
  };
  const unavailable = () =>
    new InternalAccountAdminError('Unable to reset the account password', 503);
  if (
    (await coordinate({ ...lease, action: 'acquire' })).outcome !== 'acquired'
  )
    throw new InternalAccountAdminError(
      'Another authenticator change is in progress',
      409
    );
  const started = Date.now();
  const assertOwned = async () => {
    if (
      Date.now() - started >= 60_000 ||
      (await coordinate({ ...lease, action: 'check' })).outcome !== 'owned'
    )
      throw unavailable();
  };
  try {
    const current = await admin.auth.admin.getUserById(targetUserId);
    if (
      current.error ||
      current.data.user?.id !== targetUserId ||
      current.data.user.email?.toLowerCase() !== expectedEmail.toLowerCase()
    )
      throw unavailable();
    const required = readRequiredMfaPolicy(
      current.data.user.app_metadata
    ).required;
    let appliedPolicy =
      current.data.user.app_metadata?.[REQUIRED_MFA_POLICY_KEY];
    await assertOwned();
    if (required) {
      appliedPolicy = await transitionAccountMfaPolicy(
        admin,
        targetUserId,
        appliedPolicy,
        accountRecoveryPolicy(true)[REQUIRED_MFA_POLICY_KEY]
      );
    }
    await assertOwned();
    const result = await admin.auth.admin.updateUserById(targetUserId, {
      password,
    });
    if (result.error || !result.data.user) throw unavailable();
    if (required) {
      await assertOwned();
      await transitionAccountMfaPolicy(
        admin,
        targetUserId,
        appliedPolicy,
        accountRecoveryPolicy(false)[REQUIRED_MFA_POLICY_KEY]
      );
      return admin.auth.admin.getUserById(targetUserId);
    }
    return result;
  } finally {
    await coordinate({ ...lease, action: 'release' }).catch(() =>
      console.warn('Could not release account recovery lease')
    );
  }
}
