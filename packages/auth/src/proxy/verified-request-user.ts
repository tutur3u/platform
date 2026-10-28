import { createClient } from '@tuturuuu/supabase/next/server';
import { peekRequestVerifiedUser } from '@tuturuuu/utils/request-verified-user';
import { accountAssuranceCredentials } from '@tuturuuu/utils/required-mfa-credentials';
import type { NextRequest } from 'next/server';

export { bindRequestAppToken } from '@tuturuuu/utils/request-verified-user';

/** Read TOTP enrollment from the user this request already revalidated for
 * `userId`; only when none exists fall back to the provider factor listing. */
export async function hasVerifiedTotpFactor(
  req: NextRequest,
  userId: string | null | undefined
) {
  for (const token of accountAssuranceCredentials(req)) {
    const user = userId ? peekRequestVerifiedUser(req, token) : null;
    if (user && user.id === userId)
      return (user.factors ?? []).some(
        (factor) =>
          factor.factor_type === 'totp' && factor.status === 'verified'
      );
  }
  const { data } = await (await createClient()).auth.mfa.listFactors();
  return data?.totp?.some((factor) => factor.status === 'verified') || false;
}
