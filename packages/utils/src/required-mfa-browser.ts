import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  mfaProofFromVerifiedClaims,
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from './required-mfa-policy';

/** UX routing only; server/database gates remain authoritative. */
export async function requiresAccountMfa(
  client: TypedSupabaseClient,
  options: { acceptMobileApproval?: boolean } = {}
) {
  const user = await client.auth.getUser();
  if (user.error || !user.data.user)
    throw new Error('Unable to verify account security');
  const policy = readRequiredMfaPolicy(user.data.user.app_metadata);
  if (policy.required) {
    const claims = await client.auth.getClaims();
    if (claims.error || claims.data?.claims.sub !== user.data.user.id)
      return true;
    if (
      !satisfiesRequiredMfaPolicy(
        policy,
        mfaProofFromVerifiedClaims(claims.data.claims)
      )
    ) {
      if (options.acceptMobileApproval) {
        // The database validates the consumed approval against this exact
        // provider session, current policy boundary, and proof expiry.
        const result = await client.rpc('account_required_mfa_satisfied');
        if (!result.error && result.data === true) return false;
      }
      return true;
    }
    const verified = await client.rpc('account_required_mfa_satisfied');
    return Boolean(verified.error || verified.data !== true);
  }
  const { data, error } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}
