import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { requiresAccountMfa } from '@tuturuuu/utils/required-mfa-browser';
import { useCallback } from 'react';

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

/**
 * How `/login` treats an `mfa` hint from a relying page.
 *
 * - `challenge` (`mfa=required`): sent by the shared auth proxy, Finance and
 *   other satellites when a session needs its second factor. Those surfaces
 *   accept an approve-on-phone, so the challenge offers it.
 * - `code` (`mfa=totp`): sent by the SSO consent page, which needs a fresh
 *   authenticator-code proof; a mobile approval cannot satisfy it.
 *
 * A hint can only add a requirement: it never skips sign-in, enrolment or a
 * challenge, and it never changes where the sign-in returns to.
 */
export type MfaStepUpHint = 'none' | 'challenge' | 'code';

export function readMfaStepUpHint(
  searchParams: SearchParamsLike
): MfaStepUpHint {
  switch (searchParams.get('mfa')) {
    case 'required':
      return 'challenge';
    case 'totp':
      return 'code';
    default:
      return 'none';
  }
}

/**
 * Whether the sign-in must show the MFA challenge or the required
 * enrolment before continuing. UX routing only; server and database gates
 * stay authoritative.
 *
 * - Without a hint this is exactly the account policy check.
 * - With a hint, a session that is still at aal1 while a verified factor
 *   would lift it to aal2 is always challenged.
 * - Only the `code` hint stops a mobile approval from counting.
 * - Accounts without a verified factor keep today's policy: required
 *   enrolment only when the account requires MFA.
 */
export async function requiresLoginMfa(
  client: TypedSupabaseClient,
  { stepUp }: { stepUp: MfaStepUpHint }
) {
  if (
    await requiresAccountMfa(client, {
      acceptMobileApproval: stepUp !== 'code',
    })
  ) {
    return true;
  }

  if (stepUp === 'none') return false;

  const { data, error } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  // A failed read throws, as the policy check does; it never skips ahead.
  if (error) throw error;
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}

/** The login's MFA check, bound to the current step-up hint. */
export function useLoginMfaCheck(
  client: TypedSupabaseClient,
  searchParams: SearchParamsLike
) {
  const stepUp = readMfaStepUpHint(searchParams);
  return useCallback(
    () => requiresLoginMfa(client, { stepUp }),
    [client, stepUp]
  );
}
