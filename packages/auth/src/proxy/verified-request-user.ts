import { createClient } from '@tuturuuu/supabase/next/server';
import { peekRequestVerifiedUser } from '@tuturuuu/utils/request-verified-user';
import { accountAssuranceCredentials } from '@tuturuuu/utils/required-mfa-credentials';
import type { NextRequest } from 'next/server';

export { bindRequestAppToken } from '@tuturuuu/utils/request-verified-user';

/** TOTP enrollment of the user this request already revalidated for `userId`,
 * or `null` when no such user is cached. It never asks the provider, so a
 * caller that must fail closed can treat `null` as unavailable assurance. */
export function peekVerifiedTotpFactor(
  req: NextRequest,
  userId: string | null | undefined
): boolean | null {
  if (!userId) return null;
  for (const token of accountAssuranceCredentials(req)) {
    const user = peekRequestVerifiedUser(req, token);
    if (user && user.id === userId)
      return (user.factors ?? []).some(
        (factor) =>
          factor.factor_type === 'totp' && factor.status === 'verified'
      );
  }
  return null;
}

/** Read TOTP enrollment from the user this request already revalidated for
 * `userId`; only when none exists fall back to the provider factor listing. */
export async function hasVerifiedTotpFactor(
  req: NextRequest,
  userId: string | null | undefined
) {
  const cached = peekVerifiedTotpFactor(req, userId);
  if (cached !== null) return cached;
  const { data } = await (await createClient()).auth.mfa.listFactors();
  return data?.totp?.some((factor) => factor.status === 'verified') || false;
}
