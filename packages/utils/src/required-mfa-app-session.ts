import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { AppCoordinationTokenClaims } from './app-coordination-token';
import { bindCurrentMfaFactor } from './required-mfa-lineage';
import {
  type MfaSessionProof,
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from './required-mfa-policy';

/** Claims must already be signature/scope/target verified by the caller. */
export async function isRequiredMfaAppSessionAllowed(
  claims: AppCoordinationTokenClaims
) {
  return isRequiredMfaProofAllowed(claims.sub, claims.mfa ?? null);
}

export async function isRequiredMfaProofAllowed(
  userId: string,
  proof: MfaSessionProof | null
) {
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw new Error('Account security is unavailable');
  if (!data.user || data.user.id !== userId) return false;
  if (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now())
    return false;
  const policy = readRequiredMfaPolicy(data.user.app_metadata);
  if (!policy.required) return true;
  if (!proof || !satisfiesRequiredMfaPolicy(policy, proof)) return false;
  return Boolean(await bindCurrentMfaFactor(admin, userId, proof));
}
