import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { requiresAccountMfa } from '@tuturuuu/utils/required-mfa-browser';
import { useCallback } from 'react';

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

/**
 * `/login?mfa=required` is a step-up hint from a relying page (the SSO
 * consent screen) that needs a fresh authenticator code. The hint can only
 * add a requirement: it never skips sign-in, enrolment or a challenge, and
 * it never changes where the sign-in returns to.
 */
export function readMfaStepUpHint(searchParams: SearchParamsLike) {
  return searchParams.get('mfa') === 'required';
}

/**
 * Whether the sign-in must show the MFA challenge or the required
 * enrolment before continuing. UX routing only; server and database gates
 * stay authoritative.
 *
 * - Without the hint this is exactly the account policy check.
 * - With the hint, a mobile approval no longer counts as satisfying the
 *   challenge (the step-up asks for an authenticator code), and a session
 *   that is still at aal1 while a verified factor would lift it to aal2 is
 *   always challenged. Accounts without a verified factor keep today's
 *   policy: required enrolment only when the account requires MFA.
 */
export async function requiresLoginMfa(
  client: TypedSupabaseClient,
  { stepUpRequested }: { stepUpRequested: boolean }
) {
  if (
    await requiresAccountMfa(client, {
      acceptMobileApproval: !stepUpRequested,
    })
  ) {
    return true;
  }

  if (!stepUpRequested) return false;

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
  const stepUpRequested = readMfaStepUpHint(searchParams);
  return useCallback(
    () => requiresLoginMfa(client, { stepUpRequested }),
    [client, stepUpRequested]
  );
}
